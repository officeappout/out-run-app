# text-on-brand migration — remaining white-on-brand-fill inventory (after PR 2)

Generated 13.10.2026 by a regex pass over consumer .tsx (admin/authority/wedding excluded). `N` = same element has brand fill + `text-white`; `N?` = white text within 12 lines after a brand-fill line (needs manual review: parent-inherited, dark overlay, or emoji). Heuristic — multi-line/ternary/style cases can be missed or over-reported.

**PR 2 migrated:** gateway, root page, home, profile, roadmap, progress, search, arena/create, onboarding-new/*, components/ui + AuthModal, features/home, profile, schedule, user/onboarding.

**Deliberately NOT converted (not brand-cyan fills — separate wave):** emerald `#10B981` (SummaryStep pressed, RunningScheduleStep running day, StickyActionButton success), FeedbackFAB close-X on gray-700, emoji, dark-card headings.

**Deferred to PR 3:** map layers (David-owned, map chat), workouts/*, run, workout-engine, parks, progression-map, safecity, rest.

| file | lines |
|---|---|
| src/app/active-workout-ui/page.tsx | 160, 162? |
| src/app/community/page.tsx | 811? |
| src/app/map/layers/BuilderLayer.tsx | 91, 93? |
| src/app/map/layers/DiscoverLayer.tsx | 111, 129 |
| src/app/map/layers/FreeRunLayer.tsx | 349, 360, 362? |
| src/app/map/layers/NavigateLayer.tsx | 93, 95? |
| src/app/map/layers/PlannedPreviewLayer.tsx | 170, 148?, 172? |
| src/app/run/page.tsx | 96 |
| src/app/workouts/[id]/WorkoutPreviewClient.tsx | 561 |
| src/app/workouts/[id]/active/page.tsx | 1668 |
| src/app/workouts/[id]/opengraph-image.tsx | 65? |
| src/app/workouts/[id]/overview/page.tsx | 301 |
| src/components/system/PushForegroundToast.tsx | 74?, 75?, 82? |
| src/components/ui/FeedbackFAB.tsx | 340? |
| src/components/ui/StickyActionButton.tsx | 56 |
| src/features/app/home/components/DailyPhrase.tsx | 151, 169 |
| src/features/arena/components/CommunityAddressSearch.tsx | 157? |
| src/features/arena/components/CreateGroupWizard.tsx | 463, 1162, 467? |
| src/features/arena/components/GroupDetailsDrawer.tsx | 776, 846, 1880, 1932 |
| src/features/content/equipment/gym/admin/GymEquipmentEditorForm.tsx | 510, 624 |
| src/features/content/exercises/admin/components/BulkTranslationDialog.tsx | 153 |
| src/features/content/exercises/admin/components/exercise-editor/ExecutionMethodCard.tsx | 493 |
| src/features/content/exercises/admin/components/exercise-editor/MethodsSection.tsx | 443 |
| src/features/content/exercises/admin/components/exercise-editor/MuscleSelectionSection.tsx | 147 |
| src/features/content/exercises/admin/components/exercise-editor/shared/GenderedTextInput.tsx | 379 |
| src/features/content/exercises/client/components/EquipmentFilterSheet.tsx | 467 |
| src/features/content/exercises/client/components/FilterSheet.tsx | 110 |
| src/features/content/exercises/client/components/MasterExerciseView.tsx | 1032 |
| src/features/content/exercises/client/components/SecondaryFiltersTrigger.tsx | 39, 45 |
| src/features/home/components/RunDetailsDrawer.tsx | 192? |
| src/features/home/components/rows/GhostUpsell.tsx | 130? |
| src/features/home/components/widgets/CompactMetricTile.tsx | 74? |
| src/features/home/components/widgets/StrengthVolumeWidget.tsx | 125? |
| src/features/legal/components/LegalDocModal.tsx | 157 |
| src/features/parks/client/components/contribution-wizard/QuickReportSheet.tsx | 115 |
| src/features/parks/client/components/contribution-wizard/Step1LocationPicker.tsx | 150, 160 |
| src/features/parks/client/components/contribution-wizard/Step2Details.tsx | 71, 95 |
| src/features/parks/client/components/contribution-wizard/SuggestEditSheet.tsx | 162?, 173? |
| src/features/parks/client/components/equipment-detail/EquipmentCard.tsx | 229 |
| src/features/parks/client/components/equipment-detail/EquipmentDetailDrawer.tsx | 636, 703 |
| src/features/parks/client/components/park-detail/ParkDetailSheet.tsx | 749, 753? |
| src/features/parks/client/components/park-preview/index.tsx | 144, 155? |
| src/features/parks/client/components/planned-activity/PlannedActivityComposeSheet.tsx | 605 |
| src/features/parks/client/components/route-preview/RouteDetailSheet.tsx | 508 |
| src/features/parks/core/components/ActiveWorkoutOverlay.tsx | 158? |
| src/features/parks/core/components/MapTabs.tsx | 27 |
| src/features/safecity/components/KudoSheet.tsx | 104? |
| src/features/safecity/components/LiveFriendMarker.tsx | 92? |
| src/features/safecity/components/ViralUnlockSheet.tsx | 159 |
| src/features/social/components/ChatInbox.tsx | 292, 421 |
| src/features/social/components/ChatThread.tsx | 419, 460? |
| src/features/social/components/PartnerCard.tsx | 67 |
| src/features/user/onboarding/components/steps/PersonaStep.tsx | 743? |
| src/features/user/onboarding/components/steps/RunningScheduleStep.tsx | 539 |
| src/features/user/onboarding/components/steps/SummaryStep.tsx | 417 |
| src/features/user/progression/components/IdentityHeroCard.tsx | 114? |
| src/features/user/progression/components/LemurAvatar.tsx | 72? |
| src/features/workout-engine/components/strength/StrengthDopamineScreen.tsx | 529, 488? |
| src/features/workout-engine/components/strength/StrengthSummaryPage.tsx | 427 |
| src/features/workout-engine/components/strength/components/LevelGoalsChecklist.tsx | 57? |
| src/features/workout-engine/components/strength/components/LevelUpModal.tsx | 93 |
| src/features/workout-engine/components/strength/components/LifestyleCTA.tsx | 47, 38?, 41? |
| src/features/workout-engine/players/running/components/FreeRun/FreeRunSummary.tsx | 691, 862, 803? |
| src/features/workout-engine/players/running/components/FreeRun/LapSnapshotOverlay.tsx | 66? |
| src/features/workout-engine/players/running/components/FreeRun/RunLapsList.tsx | 102 |
| src/features/workout-engine/players/running/components/FreeRun/WorkoutSettingsDrawer.tsx | 155, 165, 175, 323 |
| src/features/workout-engine/players/running/components/MissedWorkoutBanner.tsx | 31?, 33? |
| src/features/workout-engine/players/running/components/PlannedRun/PlannedRunActive.tsx | 398, 464, 527, 467? |
| src/features/workout-engine/players/running/components/PlannedRun/RunBlockPlaylist.tsx | 171 |
| src/features/workout-engine/players/running/components/PlannedRun/WorkoutPreviewScreen.tsx | 246 |
| src/features/workout-engine/players/running/components/RunControls.tsx | 48? |
| src/features/workout-engine/players/strength/components/ExerciseDetailContent.tsx | 386 |
| src/features/workout-engine/players/strength/components/ExerciseDetailsSheet.tsx | 201 |
| src/features/workout-engine/players/strength/components/ExitConfirmModal.tsx | 77 |
| src/features/workout-engine/players/strength/components/FillingButton.tsx | 152? |
| src/features/workout-engine/players/strength/components/IsometricTimerCard.tsx | 332 |
| src/features/workout-engine/players/strength/components/LiveWorkoutOverlay.tsx | 446?, 448? |
| src/features/workout-engine/players/strength/components/ResumeWorkoutDialog.tsx | 74 |
| src/features/workout-engine/players/strength/components/SegmentCard.tsx | 30 |
| src/features/workout-engine/players/strength/components/StationCard.tsx | 85 |
| src/features/workout-engine/players/strength/components/TravelCard.tsx | 25? |
| src/features/workout-engine/players/strength/components/WorkoutTimeline.tsx | 36? |
| src/features/workout-engine/players/strength/playlist/WorkoutBlockCard.tsx | 297? |
| src/features/workout-engine/players/strength/playlist/blocks/StrengthExerciseCard.tsx | 241? |
