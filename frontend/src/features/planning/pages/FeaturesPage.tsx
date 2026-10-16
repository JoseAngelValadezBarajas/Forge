import type { Workspace } from "../../../api";
import { PlanningPage } from "./PlanningPage";

export function FeaturesPage({
  workspace,
  onOpenPalette,
}: {
  workspace: Workspace | null;
  onOpenPalette: (button: HTMLButtonElement) => void;
}) {
  return (
    <PlanningPage
      mode="features"
      onOpenPalette={onOpenPalette}
      workspace={workspace}
    />
  );
}
