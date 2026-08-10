import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflows = [
  {
    file: ".github/workflows/dryrun.yml",
    jobId: "build",
    jobName: "Build Apps",
  },
  {
    file: ".github/workflows/lint.yml",
    jobId: "lint",
    jobName: "Lint source code",
  },
  {
    file: ".github/workflows/lintrepo.yml",
    jobId: "check",
    jobName: "Lint monorepo",
  },
];

const interactionRuntimeSha = "5da51b7b71b1db9ce531f946ec2bb90411a31300";

function indentedBlock(source, header, indentation) {
  const spaces = " ".repeat(indentation);
  const start = source.indexOf(`${spaces}${header}:\n`);
  assert.notEqual(start, -1, `missing ${header} block`);

  const bodyStart = start + indentation + header.length + 2;
  const rest = source.slice(bodyStart);
  const nextHeader = rest.search(new RegExp(`^${spaces}\\S`, "m"));
  return nextHeader === -1 ? rest : rest.slice(0, nextHeader);
}

for (const workflow of workflows) {
  test(`${workflow.file} exposes ${workflow.jobName} on pull requests`, async () => {
    const source = await readFile(workflow.file, "utf8");
    const onBlock = indentedBlock(source, "on", 0);
    const jobsBlock = indentedBlock(source, "jobs", 0);

    assert.match(onBlock, /^  push:\s*$/m);
    assert.match(onBlock, /^  pull_request:\s*$/m);
    assert.match(onBlock, /^  workflow_dispatch:\s*$/m);
    assert.equal(
      indentedBlock(onBlock, "pull_request", 2).trim(),
      "",
      "pull_request must be unfiltered so required checks always report",
    );
    assert.equal(
      indentedBlock(source, "permissions", 0).trim(),
      "contents: read",
    );

    const jobBlock = indentedBlock(jobsBlock, workflow.jobId, 2);
    const jobName = jobBlock.match(/^ {4}name:\s+(.+)\s*$/m)?.[1];
    assert.equal(jobName, workflow.jobName);
  });
}

test("ReviewRouter interaction is an exact thin reusable caller", async () => {
  const source = await readFile(
    ".github/workflows/reviewrouter-interaction.yml",
    "utf8",
  );
  const uses = [...source.matchAll(/^\s+uses:\s+(\S+)\s*$/gm)].map(
    (match) => match[1],
  );

  assert.deepEqual(uses, [
    `777genius/review-router/.github/workflows/reviewrouter-interaction-reusable.yml@${interactionRuntimeSha}`,
  ]);
  assert.match(source, /^  pull_request_review_comment:\n    types: \[created, edited\]$/m);
  assert.match(source, /^  issue_comment:\n    types: \[created, edited\]$/m);
  assert.match(source, /^  workflow_dispatch:\s*$/m);
  assert.match(
    source,
    /^    if: \$\{\{ github\.event_name == 'workflow_dispatch' \|\| \(\(github\.event_name != 'issue_comment' \|\| github\.event\.issue\.pull_request\) && github\.event\.comment\.user\.type != 'Bot'\) \}\}$/m,
  );
  assert.match(
    source,
    new RegExp(`^      runtime_ref: "${interactionRuntimeSha}"$`, "m"),
  );

  for (const expected of [
    "      review_workflow_file: reviewrouter-codex.yml",
    "      discussion_mode: ${{ vars.REVIEW_ROUTER_DISCUSSION_MODE || 'off' }}",
    "      discussion_model: ${{ vars.REVIEW_CODEX_MODEL || 'gpt-5.5' }}",
    "      discussion_reasoning_effort: ${{ vars.REVIEW_CODEX_EFFORT || 'xhigh' }}",
    "      discussion_max_per_pr: ${{ vars.REVIEW_ROUTER_DISCUSSION_MAX_PER_PR || '20' }}",
    "      discussion_max_per_thread: ${{ vars.REVIEW_ROUTER_DISCUSSION_MAX_PER_THREAD || '5' }}",
    "      discussion_timeout_seconds: ${{ vars.REVIEW_ROUTER_DISCUSSION_TIMEOUT_SECONDS || '60' }}",
    "      REVIEW_ROUTER_LEDGER_KEY: ${{ secrets.REVIEW_ROUTER_LEDGER_KEY }}",
    "      CODEX_AUTH_JSON: ${{ secrets.REVIEWROUTER_CODEX_AUTH_JSON }}",
  ]) {
    assert.ok(source.includes(expected), `missing caller contract: ${expected}`);
  }

  assert.doesNotMatch(source, /^    runs-on:/m);
  assert.doesNotMatch(source, /^    steps:/m);
  assert.doesNotMatch(source, /secrets\.REVIEWROUTER_LEDGER_KEY/);
  assert.doesNotMatch(source, /\.reviewrouter-runtime|npm install|node \.reviewrouter-runtime/);
});
