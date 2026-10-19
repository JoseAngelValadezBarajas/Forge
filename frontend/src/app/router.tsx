import { Route, Routes } from "react-router-dom";

import type { Workspace } from "../api";
import { DecisionsPage } from "../features/decisions";
import { DeliveryPage } from "../features/delivery";
import { InvariantsPage } from "../features/invariants";
import {
  EpicDetailPage,
  FeatureDetailPage,
  FeaturesPage,
  ProjectBoardPage,
} from "../features/planning";
import { HomePage, ProjectsPage } from "../features/projects";
import { FeatureContextPage, RepositoriesPage } from "../features/repositories";
import {
  HandoffDetailPage,
  HandoffQueuePage,
  RunCreatePage,
  RunDetailPage,
  RunInventoryPage,
  WorkbenchPage,
} from "../features/workbench";
import { ProjectOverviewWithRepositories } from "./compositions/ProjectOverviewWithRepositories";

type AppRouterProps = {
  activeWorkspace: Workspace | null;
  workspaceCount: number;
  onOpenPalette: (button: HTMLButtonElement) => void;
};

export function AppRouter({
  activeWorkspace,
  workspaceCount,
  onOpenPalette,
}: AppRouterProps) {
  return (
    <Routes>
      <Route
        element={
          <WorkspaceRoutes
            activeWorkspace={activeWorkspace}
            onOpenPalette={onOpenPalette}
            workspaceCount={workspaceCount}
          />
        }
        path="*"
      />
    </Routes>
  );
}

function WorkspaceRoutes({
  activeWorkspace,
  workspaceCount,
  onOpenPalette,
}: AppRouterProps) {
  return (
    <Routes>
      <Route
        element={
          <HomePage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
            workspaceCount={workspaceCount}
          />
        }
        path="/"
      />
      <Route
        element={
          <ProjectsPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects"
      />
      <Route
        element={
          <ProjectOverviewWithRepositories
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId"
      />
      <Route
        element={
          <RepositoriesPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/repositories"
      />
      <Route
        element={
          <ProjectBoardPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/board"
      />
      <Route
        element={
          <FeaturesPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/features"
      />
      <Route
        element={
          <FeaturesPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/epics"
      />
      <Route
        element={
          <EpicDetailPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/epics/:epicId"
      />
      <Route
        element={
          <FeatureDetailPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/features/:featureId"
      />
      <Route
        element={
          <FeatureContextPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/features/:featureId/context"
      />
      <Route
        element={
          <DecisionsPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/decisions"
      />
      <Route
        element={
          <InvariantsPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/invariants"
      />
      <Route
        element={
          <WorkbenchPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/workbench"
      />
      <Route
        element={
          <RunInventoryPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/workbench/runs"
      />
      <Route
        element={
          <RunCreatePage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/workbench/runs/new"
      />
      <Route
        element={
          <HandoffQueuePage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/workbench/handoffs"
      />
      <Route
        element={
          <RunDetailPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/runs/:runId"
      />
      <Route
        element={
          <HandoffDetailPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/handoffs/:handoffId"
      />
      <Route
        element={
          <DeliveryPage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
          />
        }
        path="/projects/:projectId/delivery/*"
      />
      <Route
        element={
          <HomePage
            onOpenPalette={onOpenPalette}
            workspace={activeWorkspace}
            workspaceCount={workspaceCount}
          />
        }
        path="*"
      />
    </Routes>
  );
}
