import {
  buildAutoblogSettingsUpdate,
  getAutoblogRuntime,
  getAutoblogSettings,
  getAutoblogSettingKey,
  maskStoredSecret,
  serializeAutoblogSettings,
} from './lib/settings.mjs';
import {
  computeNextRunAt,
  IMAGE_ASPECT_RATIOS,
} from './lib/time.mjs';
import {
  generateAutoblogPost,
  resolveAutoblogAuthorId,
} from './lib/generator.mjs';

const SCHEDULER_INTERVAL_MS = 60_000;
const SCHEDULE_MODE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
];
const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];
const POST_STATUS_OPTIONS = [
  { value: 'draft', label: 'Save as Draft' },
  { value: 'published', label: 'Publish Immediately' },
];

let schedulerHandle = null;
let activeRuntime = null;
const runningSiteIds = new Set();

export default {
  name: 'AI Autoblog',
  version: '1.0.0',
  description: 'Schedules AI-generated blog posts with OpenRouter text and image models, SEO metadata, and featured images.',
  admin: {
    viewsDir: './admin/views',
    staticDir: './static',
    navItems: [
      {
        label: 'AI Autoblog',
        href: '/admin/plugins/ai-autoblog',
        activeNav: 'ai-autoblog',
        visible({ currentSite, currentSiteRole, currentUser }) {
          return Boolean(currentSite) && (
            currentUser?.role === 'superadmin'
            || currentSiteRole === 'admin'
            || currentSiteRole === 'superadmin'
          );
        },
      },
    ],
  },
  staticDir: './static',
  setup(ctx) {
    activeRuntime = ctx;

    if (schedulerHandle) {
      clearInterval(schedulerHandle);
    }

    const tick = async () => {
      try {
        await runScheduledJobs();
      } catch (error) {
        ctx.logger.error('scheduled autoblog run failed:', error);
      }
    };

    void tick();
    schedulerHandle = setInterval(() => {
      void tick();
    }, SCHEDULER_INTERVAL_MS);
    ctx.logger.info('registered AI autoblog extension');
  },
  registerAdminRoutes({ router, auth, plugin, services }) {
    router.get('/plugins/ai-autoblog', auth.requireAuth(), auth.requireSiteRole('admin'), async (req, res, next) => {
      try {
        const site = req.site;
        if (!site) {
          req.flash('error', 'Select a site before configuring the autoblog.');
          return res.redirect('/admin/sites');
        }

        const [settings, siteUsers] = await Promise.all([
          getAutoblogSettings(services.settingsService, site.id),
          services.userService.getSiteUsers(site.id),
        ]);

        res.render('plugins/ai-autoblog/settings', {
          title: 'AI Autoblog',
          activeNav: plugin.slug,
          plugin,
          assetBase: plugin.staticMountPath,
          autoblog: settings,
          runtime: getAutoblogRuntime(settings, site),
          siteUsers,
          scheduleModeOptions: SCHEDULE_MODE_OPTIONS,
          weekdayOptions: WEEKDAY_OPTIONS,
          postStatusOptions: POST_STATUS_OPTIONS,
          aspectRatioOptions: IMAGE_ASPECT_RATIOS,
          storedApiKeyMask: maskStoredSecret(settings.storedApiKey),
        });
      } catch (error) {
        next(error);
      }
    });

    router.post('/plugins/ai-autoblog', auth.requireAuth(), auth.requireSiteRole('admin'), async (req, res, next) => {
      try {
        const site = req.site;
        if (!site) {
          req.flash('error', 'Select a site before configuring the autoblog.');
          return res.redirect('/admin/sites');
        }

        const existingSettings = await getAutoblogSettings(services.settingsService, site.id);
        const updatedSettings = buildAutoblogSettingsUpdate({
          body: req.body,
          existingSettings,
          site,
        });

        await services.settingsService.setMany(site.id, serializeAutoblogSettings(updatedSettings));

        const runtime = getAutoblogRuntime(updatedSettings, site);
        if (runtime.ready || !updatedSettings.enabled) {
          req.flash('success', 'AI autoblog settings saved.');
        } else {
          req.flash('info', `AI autoblog settings saved, but it still needs: ${runtime.missingFields.join(', ')}.`);
        }

        return res.redirect('/admin/plugins/ai-autoblog');
      } catch (error) {
        req.flash('error', error instanceof Error ? error.message : 'Unable to save AI autoblog settings.');
        return res.redirect('/admin/plugins/ai-autoblog');
      }
    });

    router.post('/plugins/ai-autoblog/run', auth.requireAuth(), auth.requireSiteRole('admin'), async (req, res, next) => {
      try {
        const site = req.site;
        if (!site) {
          req.flash('error', 'Select a site before running the autoblog.');
          return res.redirect('/admin/sites');
        }

        const settings = await getAutoblogSettings(services.settingsService, site.id);
        const result = await runAutoblogJob({
          site,
          settings,
          manualAuthorId: req.session.userId,
          advanceSchedule: false,
        });

        req.flash('success', `Created "${result.title}"${settings.postStatus === 'draft' ? ' as a draft' : ''}.`);
        if (result.imageWarning) {
          req.flash('info', `Post created, but the featured image was skipped: ${result.imageWarning}`);
        }
        return res.redirect('/admin/plugins/ai-autoblog');
      } catch (error) {
        req.flash('error', error instanceof Error ? error.message : 'Unable to generate a post right now.');
        return res.redirect('/admin/plugins/ai-autoblog');
      }
    });
  },
};

async function runScheduledJobs() {
  if (!activeRuntime) {
    return;
  }

  const sites = await activeRuntime.services.siteService.getAll();
  for (const site of sites) {
    if (runningSiteIds.has(site.id)) {
      continue;
    }

    const settings = await getAutoblogSettings(activeRuntime.services.settingsService, site.id);
    if (!settings.enabled) {
      continue;
    }

    const runtime = getAutoblogRuntime(settings, site);
    if (!settings.nextRunAt && runtime.nextRunAt) {
      await activeRuntime.services.settingsService.set(site.id, getAutoblogSettingKey('next_run_at'), runtime.nextRunAt);
      continue;
    }

    if (!runtime.nextRunAt) {
      continue;
    }

    const dueAt = new Date(runtime.nextRunAt);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() > Date.now()) {
      continue;
    }

    try {
      const result = await runAutoblogJob({
        site,
        settings,
        manualAuthorId: null,
        advanceSchedule: true,
      });
      activeRuntime.logger.info(`created scheduled post "${result.title}" for site "${site.slug}"`);
      if (result.imageWarning) {
        activeRuntime.logger.warn(`scheduled post image warning for "${site.slug}":`, result.imageWarning);
      }
    } catch (error) {
      activeRuntime.logger.error(`scheduled post generation failed for site "${site.slug}":`, error);
    }
  }
}

async function runAutoblogJob({
  site,
  settings,
  manualAuthorId,
  advanceSchedule,
}) {
  if (!activeRuntime) {
    throw new Error('AI autoblog runtime is not initialized.');
  }
  if (runningSiteIds.has(site.id)) {
    throw new Error('The AI autoblog is already generating a post for this site.');
  }

  runningSiteIds.add(site.id);

  try {
    const authorId = await resolveAutoblogAuthorId({
      services: activeRuntime.services,
      siteId: site.id,
      manualAuthorId,
      preferredAuthorId: settings.authorUserId,
    });
    const result = await generateAutoblogPost({
      site,
      settings,
      services: activeRuntime.services,
      pool: activeRuntime.pool,
      config: activeRuntime.config,
      logger: activeRuntime.logger,
      authorId,
    });
    const nextRunAt = resolveNextRunAt(site, settings, advanceSchedule);

    await activeRuntime.services.settingsService.setMany(site.id, serializeAutoblogSettings({
      ...settings,
      nextRunAt,
      lastRunAt: new Date().toISOString(),
      lastError: '',
      lastWarning: result.imageWarning || '',
      lastPostId: result.post.id,
      lastPostTitle: result.title,
      lastPostSlug: result.slug,
    }));

    return result;
  } catch (error) {
    const nextRunAt = resolveNextRunAt(site, settings, advanceSchedule);

    await activeRuntime.services.settingsService.setMany(site.id, serializeAutoblogSettings({
      ...settings,
      nextRunAt,
      lastError: error instanceof Error ? error.message : 'AI autoblog failed.',
      lastWarning: '',
    }));

    throw error;
  } finally {
    runningSiteIds.delete(site.id);
  }
}

function resolveNextRunAt(site, settings, advanceSchedule) {
  if (!settings.enabled) {
    return null;
  }

  const currentNextRun = settings.nextRunAt ? new Date(settings.nextRunAt) : null;
  const shouldRecompute = advanceSchedule
    || !currentNextRun
    || Number.isNaN(currentNextRun.getTime())
    || currentNextRun.getTime() <= Date.now();

  if (!shouldRecompute) {
    return settings.nextRunAt;
  }

  return computeNextRunAt({
    now: new Date(Date.now() + 1_000),
    timeZone: site.timezone,
    scheduleMode: settings.scheduleMode,
    scheduleTime: settings.scheduleTime,
    scheduleWeekday: settings.scheduleWeekday,
    startDate: settings.startDate,
  });
}
