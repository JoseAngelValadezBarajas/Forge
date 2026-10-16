import type { Workspace } from "../../../api";
import { PlanningPage } from "./PlanningPage";

export function ProjectBoardPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: (button: HTMLButtonElement) => void;
}) {
  return (
    <PlanningPage
      mode="board"
      onOpenPalette={onOpenPalette}
      workspace={workspace}
    />
  );
}
