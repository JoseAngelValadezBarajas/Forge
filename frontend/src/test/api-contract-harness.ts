import { afterEach, expect, test, vi } from "vitest";

export type ApiContractCase = {
  name: string;
  invoke: () => Promise<unknown>;
  url: string;
  method?: string;
  body?: string;
  signal?: AbortSignal;
};

export const apiMethodInventory = {
  workspacesProjects: ["listWorkspaces", "createWorkspace", "updateWorkspace", "listProjects", "getProject", "createProject", "updateProject", "archiveProject", "restoreProject", "getPlanningOverview"],
  planning: ["listEpics", "createEpic", "updateEpic", "listFeatures", "createFeature", "getFeature", "updateFeature", "listTasks", "createTask", "updateTask", "reorderTasks", "listCriteria", "createCriterion", "updateCriterion", "reorderCriteria", "listDependencies", "createDependency", "deleteDependency"],
  decisionsInvariantsReadiness: ["listDecisions", "createDecision", "updateDecision", "acceptDecision", "supersedeDecision", "listDecisionRevisions", "linkDecision", "unlinkDecision", "listFeatureDecisions", "listInvariants", "createInvariant", "updateInvariant", "retireInvariant", "listInvariantRevisions", "listFeatureInvariants", "acknowledgeInvariant", "previewReadiness", "saveReadiness", "listReadinessEvaluations"],
  repositories: ["listRepositories", "connectRepository", "observeRepository", "listObservations", "disconnectRepository", "listFeatureRepositories", "linkFeatureRepository", "unlinkFeatureRepository", "previewContextPackage", "listContextPackages", "saveContextPackage"],
  workbenchRuns: ["listRuns", "getRun", "createRun", "updateRunStatus", "listRunEvents", "addRunEvent", "listRunOutputs", "addRunOutput"],
  workbenchHandoffs: ["listHandoffs", "getHandoff", "createHandoff", "updateHandoff", "readyHandoff", "reviseHandoff", "acknowledgeHandoff", "withdrawHandoff", "listHandoffRevisions"],
  delivery: ["listEvidence", "getEvidence", "createEvidence", "invalidateEvidence", "listVerificationRules", "listVerifications", "previewVerification", "evaluateVerification", "listReleaseCandidates", "createReleaseCandidate", "getReleaseCandidate", "updateReleaseCandidate", "freezeReleaseCandidate", "previewReleaseGates", "evaluateReleaseGates", "listReleaseGateHistory", "listCandidateHistory", "saveReleaseManifest", "getReleaseManifest"],
} as const;

export type ApiContractDomain = keyof typeof apiMethodInventory;

afterEach(() => vi.unstubAllGlobals());

export function characterizeApiContracts(domain: ApiContractDomain, cases: ApiContractCase[]): void {
  test(`${domain} contract inventory covers every public operation`, () => {
    const represented = [...new Set(cases.map(({ name }) => name.split(" ")[0]))].sort();
    expect(represented).toEqual([...apiMethodInventory[domain]].sort());
  });

  test.each(cases)("$name", async ({ invoke, url, method, body, signal }) => {
    const result = { fixture: "response" };
    const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(invoke()).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [actualUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(actualUrl).toBe(url);
    expect(init?.method).toBe(method);
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(init?.body).toBe(body);
    expect(init?.signal).toBe(signal);
  });
}

export const signal = new AbortController().signal;

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}
