# Out-Run App - Project Structure

Complete directory tree of the project focusing on `src/` and root configuration files.

## Root Configuration Files

```
📄 .eslintrc.json
📄 .env.local (gitignored)
📄 next.config.js
📄 next-env.d.ts
📄 package.json
📄 package-lock.json
📄 postcss.config.mjs
📄 tailwind.config.ts
📄 tsconfig.json
📄 tsconfig.tsbuildinfo
📄 pRunMap.tsx
📄 README.md
📄 PRD.md
📄 ARCHITECTURE.md
📄 PROJECT_STRUCTURE.md
📄 CRITICAL_FIXES_COMPLETE.md
📄 DYNAMIC_GOALS_COMPLETE.md
📄 MIGRATION_GHOSTS_FIXED.md
📄 MIGRATION_WAVE_1_COMPLETE.md
📄 UI_FINALIZATION_COMPLETE.md
📄 WAVE_2_SPATIAL_MIGRATION_COMPLETE.md
📄 WAVE_3_WORKOUT_ENGINE_COMPLETE.md
📄 WAVE_4_USER_IDENTITY_COMPLETE.md
```

## Source Directory (`src/`)

```
src/
├── 📁 @core/
│   └── 📁 hooks/
│       └── 📄 useCardPage.ts
│
├── 📁 app/
│   ├── 📄 ClientLayout.tsx
│   ├── 📁 active-workout-ui/
│   │   └── 📄 page.tsx
│   ├── 📁 admin/
│   │   ├── 📁 admins-management/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 approval-center/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 audit-logs/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 auth/
│   │   │   └── 📁 callback/
│   │   │       └── 📄 page.tsx
│   │   ├── 📁 authorities/
│   │   │   ├── 📁 [id]/
│   │   │   │   └── 📄 page.tsx
│   │   │   ├── 📁 new/
│   │   │   │   └── 📄 page.tsx
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 authority-login/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 authority-manager/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 exercises/
│   │   │   ├── 📁 [id]/
│   │   │   │   └── 📄 page.tsx
│   │   │   ├── 📁 new/
│   │   │   │   └── 📄 page.tsx
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 gear-definitions/
│   │   │   ├── 📁 [id]/
│   │   │   │   └── 📄 page.tsx
│   │   │   ├── 📁 new/
│   │   │   │   └── 📄 page.tsx
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 gym-equipment/
│   │   │   ├── 📁 [id]/
│   │   │   │   └── 📄 page.tsx
│   │   │   ├── 📁 new/
│   │   │   │   └── 📄 page.tsx
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 insights/
│   │   │   └── 📄 page.tsx
│   │   ├── 📄 layout.tsx
│   │   ├── 📁 levels/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 login/
│   │   │   └── 📄 page.tsx
│   │   ├── 📄 page.tsx
│   │   ├── 📁 parks/
│   │   │   ├── 📁 [parkId]/
│   │   │   │   └── 📁 edit/
│   │   │   ├── 📁 components/
│   │   │   ├── 📁 new/
│   │   │   │   └── 📄 page.tsx
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 pending-approval/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 programs/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 questionnaire/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 routes/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 statistics/
│   │   │   └── 📄 page.tsx
│   │   └── 📁 users/
│   │       ├── 📁 all/
│   │       │   └── 📄 page.tsx
│   │       └── 📄 page.tsx
│   ├── 📁 api/
│   │   ├── 📁 admin/
│   │   │   └── 📁 re-seed-authorities/
│   │   │       └── 📄 route.ts
│   │   └── 📁 integrations/
│   │       └── 📁 universal-gis-proxy/
│   │           └── 📄 route.ts
│   ├── 📁 authority-portal/
│   │   └── 📁 login/
│   │       └── 📄 page.tsx
│   ├── 📄 favicon.ico
│   ├── 📁 fonts/
│   │   ├── 📄 SimplerPro-Bold.otf
│   │   ├── 📄 SimplerPro-Regular.otf
│   │   └── 📄 SimplerPro-Semibold.otf
│   ├── 📄 globals.css
│   ├── 📁 home/
│   │   └── 📄 page.tsx
│   ├── 📄 layout.tsx
│   ├── 📁 map/
│   │   └── 📄 page.tsx
│   ├── 📁 onboarding/
│   ├── 📁 onboarding-dynamic/
│   │   └── 📄 page.tsx
│   ├── 📁 onboarding-new/
│   │   ├── 📁 dynamic/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 intro/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 phase2-intro/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 roadmap/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 selection/
│   │   │   └── 📄 page.tsx
│   │   ├── 📁 setup/
│   │   │   └── 📄 page.tsx
│   │   └── 📄 page.tsx
│   ├── 📄 page.tsx
│   ├── 📁 profile/
│   │   └── 📄 page.tsx
│   ├── 📁 roadmap/
│   │   └── 📄 page.tsx
│   ├── 📁 run/
│   │   └── 📄 page.tsx
│   └── 📁 sounds/
│       └── 📄 coin-clink.mp3
│
├── 📁 components/
│   ├── 📄 AuthModal.tsx
│   ├── 📄 BottomNavigation.tsx
│   ├── 📄 CalculatingProfileScreen.tsx
│   ├── 📄 KingLemurLoadingScreen.tsx
│   ├── 📄 LemurMarker.tsx
│   └── 📄 ParticleBackground.tsx
│
├── 📁 constants/
│   └── 📄 terms-content.ts
│
├── 📁 contexts/
│   └── 📄 LanguageContext.tsx
│
├── 📁 features/
│   ├── 📁 admin/
│   │   ├── 📁 components/
│   │   │   ├── 📄 GymEquipmentEditorForm.tsx
│   │   │   ├── 📄 LocationPicker.tsx
│   │   │   ├── 📁 authorities/
│   │   │   │   ├── 📄 AuthoritiesHeader.tsx
│   │   │   │   ├── 📄 AuthoritiesList.tsx
│   │   │   │   ├── 📄 AuthorityFilters.tsx
│   │   │   │   └── 📄 authorityHelpers.ts
│   │   │   ├── 📁 authority-manager/
│   │   │   │   ├── 📄 AnalyticsDashboard.tsx
│   │   │   │   ├── 📄 CommunityEvents.tsx
│   │   │   │   ├── 📄 CommunityGroups.tsx
│   │   │   │   └── 📄 ParksManagement.tsx
│   │   │   ├── 📁 cpo-dashboard/
│   │   │   │   ├── 📄 AuthorityPerformanceTable.tsx
│   │   │   │   ├── 📄 ExecutiveSummary.tsx
│   │   │   │   ├── 📄 MaintenanceOverview.tsx
│   │   │   │   ├── 📄 PremiumConversion.tsx
│   │   │   │   └── 📄 ProductInsights.tsx
│   │   │   ├── 📁 shared/
│   │   │   │   └── 📄 Pagination.tsx
│   │   │   └── 📁 strategic-insights/
│   │   │       ├── 📄 EquipmentGapAnalysis.tsx
│   │   │       ├── 📄 HealthWakeUpChart.tsx
│   │   │       └── 📄 SleepyNeighborhoodsList.tsx
│   │   ├── 📁 hooks/
│   │   │   ├── 📄 useAuthorities.ts
│   │   │   └── 📄 usePagination.ts
│   │   └── 📁 services/
│   │       ├── 📄 admin-management.service.ts
│   │       ├── 📄 analytics.service.ts
│   │       ├── 📄 audit.service.ts
│   │       ├── 📄 auth.service.ts
│   │       ├── 📄 authority.service.ts
│   │       ├── 📄 community.service.ts
│   │       ├── 📄 cpo-analytics.service.ts
│   │       ├── 📄 edit-requests.service.ts
│   │       ├── 📄 engagement.service.ts
│   │       ├── 📄 gis-integration.service.ts
│   │       ├── 📄 health-economics.service.ts
│   │       ├── 📄 invitation.service.ts
│   │       ├── 📄 maintenance.service.ts
│   │       ├── 📄 parks.service.ts
│   │       ├── 📄 passwordless-auth.service.ts
│   │       ├── 📄 questionnaire.service.ts
│   │       ├── 📄 re-seed-authorities.ts
│   │       ├── 📄 remap-parks-to-authorities.ts
│   │       ├── 📄 repair-authorities.ts
│   │       ├── 📄 schema-initializer.service.ts
│   │       ├── 📄 seed-israeli-authorities.ts
│   │       ├── 📄 strategic-insights.service.ts
│   │       └── 📄 users.service.ts
│   │
│   ├── 📁 analytics/
│   │   └── 📄 AnalyticsService.ts
│   │
│   ├── 📁 content/
│   │   ├── 📁 equipment/
│   │   │   ├── 📁 gear/
│   │   │   │   ├── 📁 admin/
│   │   │   │   │   └── 📄 GearDefinitionEditorForm.tsx
│   │   │   │   ├── 📁 client/
│   │   │   │   ├── 📁 core/
│   │   │   │   │   ├── 📄 gear-definition.service.ts
│   │   │   │   │   └── 📄 gear-definition.types.ts
│   │   │   │   └── 📄 index.ts
│   │   │   └── 📁 gym/
│   │   │       ├── 📁 admin/
│   │   │       │   └── 📄 GymEquipmentEditorForm.tsx
│   │   │       ├── 📁 client/
│   │   │       ├── 📁 core/
│   │   │       │   ├── 📄 gym-equipment.service.ts
│   │   │       │   └── 📄 gym-equipment.types.ts
│   │   │       └── 📄 index.ts
│   │   ├── 📁 exercises/
│   │   │   ├── 📁 admin/
│   │   │   │   └── 📄 ExerciseEditorForm.tsx
│   │   │   ├── 📁 client/
│   │   │   ├── 📁 core/
│   │   │   │   ├── 📄 exercise.service.ts
│   │   │   │   └── 📄 exercise.types.ts
│   │   │   └── 📄 index.ts
│   │   ├── 📄 index.ts
│   │   ├── 📁 programs/
│   │   │   ├── 📁 admin/
│   │   │   ├── 📁 client/
│   │   │   ├── 📁 core/
│   │   │   │   ├── 📄 level.service.ts
│   │   │   │   ├── 📄 program.service.ts
│   │   │   │   └── 📄 program.types.ts
│   │   │   └── 📄 index.ts
│   │   └── 📁 shared/
│   │       ├── 📄 index.ts
│   │       └── 📄 localized-text.types.ts
│   │
│   ├── 📁 home/
│   │   ├── 📁 components/
│   │   │   ├── 📄 AlertModal.tsx
│   │   │   ├── 📄 CoinPill.tsx
│   │   │   ├── 📄 DailyFeed.tsx
│   │   │   ├── 📄 GuestHeroCard.tsx
│   │   │   ├── 📄 HeroCard.tsx
│   │   │   ├── 📄 HeroWorkoutCard.tsx
│   │   │   ├── 📄 ProgressCard.tsx
│   │   │   ├── 📄 QuickActions.tsx
│   │   │   ├── 📄 ScheduleCalendar.tsx
│   │   │   ├── 📄 SettingsModal.tsx
│   │   │   ├── 📄 SmartWeeklySchedule.tsx
│   │   │   ├── 📄 StatsOverview.tsx
│   │   │   ├── 📄 StatsWidgets.tsx
│   │   │   └── 📁 widgets/
│   │   │       ├── 📄 FloorsWidget.tsx
│   │   │       ├── 📄 RunningStatsWidget.tsx
│   │   │       ├── 📄 StepsWidget.tsx
│   │   │       └── 📄 WeeklyActivityWidget.tsx
│   │   ├── 📁 data/
│   │   │   └── 📄 mock-schedule-data.ts
│   │   └── 📁 hooks/
│   │       └── 📄 useSmartSchedule.ts
│   │
│   ├── 📁 navigation/
│   │   └── 📄 BottomNavbar.tsx
│   │
│   ├── 📁 parks/
│   │   ├── 📁 admin/
│   │   │   ├── 📁 components/
│   │   │   ├── 📄 index.ts
│   │   │   └── 📁 services/
│   │   ├── 📁 client/
│   │   │   ├── 📁 components/
│   │   │   │   ├── 📄 RouteCard.tsx
│   │   │   │   ├── 📁 park-drawer/
│   │   │   │   │   └── 📄 index.tsx
│   │   │   │   ├── 📁 park-item/
│   │   │   │   │   └── 📄 index.tsx
│   │   │   │   ├── 📁 park-list/
│   │   │   │   │   └── 📄 index.tsx
│   │   │   │   └── 📁 park-preview/
│   │   │   │       └── 📄 index.tsx
│   │   │   ├── 📁 hooks/
│   │   │   ├── 📄 index.ts
│   │   │   └── 📁 types/
│   │   ├── 📁 core/
│   │   │   ├── 📁 components/
│   │   │   │   ├── 📄 AIChatOverlay.tsx
│   │   │   │   ├── 📄 ActiveWorkoutOverlay.tsx
│   │   │   │   ├── 📄 AppMap.tsx
│   │   │   │   ├── 📄 BottomJourneyContainer.tsx
│   │   │   │   ├── 📄 ChatDrawer.tsx
│   │   │   │   ├── 📄 FreeActivityCard.tsx
│   │   │   │   ├── 📄 MapLayersControl.tsx
│   │   │   │   ├── 📄 MapRouteCarousel.tsx
│   │   │   │   ├── 📄 MapTabs.tsx
│   │   │   │   ├── 📄 MapTopBar.tsx
│   │   │   │   ├── 📄 NavigationHub.tsx
│   │   │   │   ├── 📄 RouteGenerationLoader.tsx
│   │   │   │   ├── 📄 RoutePlannerCard.tsx
│   │   │   │   ├── 📄 RoutePreviewDrawer.tsx
│   │   │   │   ├── 📄 RouteTimelineOverlay.tsx
│   │   │   │   └── 📄 WorkoutPreferencesModal.tsx
│   │   │   ├── 📁 data/
│   │   │   │   ├── 📄 mock-locations.ts
│   │   │   │   └── 📄 mock-routes.ts
│   │   │   ├── 📁 hooks/
│   │   │   │   ├── 📄 useFacilities.ts
│   │   │   │   ├── 📄 useMapLogic.ts
│   │   │   │   └── 📄 useRouteFilter.ts
│   │   │   ├── 📄 index.ts
│   │   │   ├── 📁 services/
│   │   │   │   ├── 📄 ai-coach.service.ts
│   │   │   │   ├── 📄 gis-integration.service.ts
│   │   │   │   ├── 📄 gis-parser.service.ts
│   │   │   │   ├── 📄 inventory.service.ts
│   │   │   │   ├── 📄 mapbox.service.ts
│   │   │   │   ├── 📄 parks.service.ts
│   │   │   │   ├── 📄 route-generator.service.ts
│   │   │   │   ├── 📄 route-ranking.service.ts
│   │   │   │   └── 📄 route.service.ts
│   │   │   ├── 📁 store/
│   │   │   │   └── 📄 useMapStore.ts
│   │   │   └── 📁 types/
│   │   │       ├── 📄 facility.types.ts
│   │   │       ├── 📄 map.types.ts
│   │   │       ├── 📄 park.types.ts
│   │   │       └── 📄 route.types.ts
│   │   └── 📄 index.ts
│   │
│   ├── 📁 user/
│   │   ├── 📁 core/
│   │   │   ├── 📄 index.ts
│   │   │   └── 📁 types/
│   │   │       ├── 📄 progression.types.ts
│   │   │       └── 📄 user.types.ts
│   │   ├── 📁 identity/
│   │   │   ├── 📁 components/
│   │   │   ├── 📄 index.ts
│   │   │   ├── 📁 services/
│   │   │   │   └── 📄 profile.service.ts
│   │   │   └── 📁 store/
│   │   │       └── 📄 useUserStore.ts
│   │   ├── 📄 index.ts
│   │   ├── 📁 onboarding/
│   │   │   ├── 📁 components/
│   │   │   │   ├── 📄 BlockingErrorModal.tsx
│   │   │   │   ├── 📄 ChoiceCard.tsx
│   │   │   │   ├── 📄 DatePicker.tsx
│   │   │   │   ├── 📄 DynamicQuestionRenderer.tsx
│   │   │   │   ├── 📄 EquipmentSelector.tsx
│   │   │   │   ├── 📄 HealthDeclaration.tsx
│   │   │   │   ├── 📄 HealthDeclarationStep.tsx
│   │   │   │   ├── 📄 LoaderScreen.tsx
│   │   │   │   ├── 📄 LoadingAIBuilder.tsx
│   │   │   │   ├── 📄 MultiDaySelector.tsx
│   │   │   │   ├── 📄 OnboardingLayout.tsx
│   │   │   │   ├── 📄 OnboardingWizard.tsx
│   │   │   │   ├── 📄 ProgramResult.tsx
│   │   │   │   ├── 📄 QuestionRenderer.tsx
│   │   │   │   ├── 📄 ResultLoading.tsx
│   │   │   │   ├── 📄 SaveProgressScreen.tsx
│   │   │   │   ├── 📄 SaveProgressStep.tsx
│   │   │   │   ├── 📄 SignaturePad.tsx
│   │   │   │   ├── 📄 SimpleSelection.tsx
│   │   │   │   ├── 📄 SummaryReveal.tsx
│   │   │   │   ├── 📄 TermsOfUse.tsx
│   │   │   │   ├── 📄 TextInput.tsx
│   │   │   │   └── 📁 steps/
│   │   │   │       ├── 📄 CitySelectionStep.tsx
│   │   │   │       ├── 📄 EquipmentStep.tsx
│   │   │   │       ├── 📄 HistoryStep.tsx
│   │   │   │       ├── 📄 LocationStep.tsx
│   │   │   │       └── 📄 ScheduleStep.tsx
│   │   │   ├── 📁 data/
│   │   │   │   ├── 📄 health-questions.ts
│   │   │   │   └── 📄 mock-questionnaire.ts
│   │   │   ├── 📁 engine/
│   │   │   │   ├── 📄 DynamicOnboardingEngine.ts
│   │   │   │   └── 📄 OnboardingEngine.ts
│   │   │   ├── 📄 index.ts
│   │   │   ├── 📁 services/
│   │   │   │   └── 📄 onboarding-sync.service.ts
│   │   │   ├── 📁 store/
│   │   │   │   └── 📄 useOnboardingStore.ts
│   │   │   └── 📄 types.ts
│   │   └── 📁 progression/
│   │       ├── 📁 components/
│   │       │   ├── 📄 BadgeDisplay.tsx
│   │       │   ├── 📄 CoinPill.tsx
│   │       │   ├── 📄 LemurAvatar.tsx
│   │       │   ├── 📄 ProgressRing.tsx
│   │       │   └── 📄 StreakScreen.tsx
│   │       ├── 📄 index.ts
│   │       ├── 📁 services/
│   │       │   ├── 📄 achievement.service.ts
│   │       │   ├── 📄 coin-calculator.service.ts
│   │       │   ├── 📄 lemur-evolution.service.ts
│   │       │   ├── 📄 progression.service.ts
│   │       │   └── 📄 smart-goals.service.ts
│   │       ├── 📁 store/
│   │       │   └── 📄 useProgressionStore.ts
│   │       └── 📁 types/
│   │
│   └── 📁 workout-engine/
│       ├── 📁 core/
│       │   ├── 📄 index.ts
│       │   ├── 📁 services/
│       │   │   └── 📄 storage.service.ts
│       │   ├── 📁 store/
│       │   │   └── 📄 useSessionStore.ts
│       │   ├── 📁 types/
│       │   │   ├── 📄 running.types.ts
│       │   │   └── 📄 session.types.ts
│       │   └── 📁 utils/
│       │       └── 📄 formatPace.ts
│       ├── 📁 generator/
│       │   ├── 📁 hooks/
│       │   │   └── 📄 useExerciseReplacement.ts
│       │   ├── 📄 index.ts
│       │   └── 📁 services/
│       │       ├── 📄 execution-method-selector.service.ts
│       │       ├── 📄 exercise-replacement.service.ts
│       │       └── 📄 workout-generator.service.ts
│       ├── 📄 index.ts
│       ├── 📁 players/
│       │   ├── 📄 index.ts
│       │   ├── 📁 running/
│       │   │   ├── 📁 components/
│       │   │   │   ├── 📄 ActiveDashboard.tsx
│       │   │   │   ├── 📄 DopamineScreen.tsx
│       │   │   │   ├── 📄 FreeRunView.tsx
│       │   │   │   ├── 📄 IntervalRunView.tsx
│       │   │   │   ├── 📄 RunControls.tsx
│       │   │   │   ├── 📄 RunDashboard.tsx
│       │   │   │   ├── 📄 RunLapsTable.tsx
│       │   │   │   ├── 📄 RunModeSelector.tsx
│       │   │   │   └── 📄 RunSummary.tsx
│       │   │   ├── 📄 index.ts
│       │   │   ├── 📁 store/
│       │   │   │   └── 📄 useRunningPlayer.ts
│       │   │   └── 📁 types/
│       │   │       ├── 📄 activity.type.ts
│       │   │       ├── 📄 run-block.type.ts
│       │   │       ├── 📄 run-plan.type.ts
│       │   │       ├── 📄 run-state.type.ts
│       │   │       └── 📄 run-workout.type.ts
│       │   └── 📁 strength/
│       │       ├── 📁 components/
│       │       │   ├── 📄 ActiveWorkoutScreen.tsx
│       │       │   ├── 📄 ExerciseReplacementModal.tsx
│       │       │   ├── 📄 LiveWorkoutOverlay.tsx
│       │       │   ├── 📄 SegmentCard.tsx
│       │       │   ├── 📄 StationCard.tsx
│       │       │   ├── 📄 TravelCard.tsx
│       │       │   ├── 📄 WorkoutHeader.tsx
│       │       │   ├── 📄 WorkoutPreviewDrawer.tsx
│       │       │   ├── 📄 WorkoutStickyNav.tsx
│       │       │   └── 📄 WorkoutTimeline.tsx
│       │       └── 📄 index.ts
│       └── 📁 shared/
│           ├── 📄 index.ts
│           └── 📁 utils/
│               └── 📄 gear-mapping.utils.ts
│
├── 📁 hooks/
│   ├── 📄 useDashboardMode.ts
│   └── 📄 useTranslation.ts
│
├── 📁 lib/
│   ├── 📄 auth.service.ts
│   ├── 📄 calories.utils.ts
│   ├── 📁 data/
│   │   └── 📄 israel-locations.ts
│   ├── 📄 firebase.ts
│   ├── 📄 firestore.service.ts
│   └── 📁 i18n/
│       ├── 📄 dictionaries.ts
│       └── 📄 onboarding-locales.ts
│
├── 📄 middleware.ts
│
├── 📁 store/
│   └── 📄 useAppStore.ts
│
└── 📁 types/
    ├── 📄 admin-types.ts
    ├── 📄 audit-log.type.ts
    ├── 📄 community.types.ts
    ├── 📄 gear-definition.type.ts
    ├── 📄 invitation.type.ts
    ├── 📄 maintenance.types.ts
    ├── 📄 onboarding-questionnaire.ts
    ├── 📄 progression-settings.type.ts
    ├── 📄 user-profile.ts
    └── 📄 workout.ts
```

## Key Directories Summary

### App Router Pages (`src/app/`)
- **Admin**: 32+ dynamic routes for admin dashboard
- **Onboarding**: Multi-step onboarding flow
- **Core Pages**: `/map`, `/run`, `/home`, `/profile`, `/roadmap`
- **API Routes**: Admin and integration endpoints

### Features (`src/features/`)
- **admin/**: Admin dashboard components, services, hooks
- **parks/**: Map functionality, route generation, park management
- **workout-engine/**: Running/strength workout logic, GPS tracking
- **user/**: User identity, onboarding, progression
- **content/**: Exercises, programs, equipment definitions
- **home/**: Home page components and widgets
- **analytics/**: Analytics service

### State Management (`src/store/` & `src/features/*/store/`)
- `useAppStore.ts`: Global app state (i18n, language)
- `useUserStore.ts`: User profile and identity
- `useSessionStore.ts`: Workout session state
- `useRunningPlayer.ts`: Running-specific state
- `useMapStore.ts`: Map and route state
- `useOnboardingStore.ts`: Onboarding flow state
- `useProgressionStore.ts`: User progression and achievements

### Services (`src/lib/` & `src/features/*/services/`)
- Firebase/Firestore integration
- Authentication services
- Mapbox integration
- GIS parsing and route generation
- Admin management services
- Analytics and health economics

### Components (`src/components/` & `src/features/*/components/`)
- Shared UI components
- Feature-specific components
- Admin dashboard components
- Workout player components
- Map and navigation components
