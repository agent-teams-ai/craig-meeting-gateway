import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflows = [
  {
    file: ".github/workflows/dryrun.yml",
    jobId: "build",
    jobName: "Build Apps",
    mirrorPaths: true,
  },
  {
    file: ".github/workflows/lint.yml",
    jobId: "lint",
    jobName: "Lint source code",
    mirrorPaths: false,
  },
  {
    file: ".github/workflows/lintrepo.yml",
    jobId: "check",
    jobName: "Lint monorepo",
    mirrorPaths: true,
  },
];

function indentedBlock(source, header, indentation) {
  const spaces = " ".repeat(indentation);
  const start = source.indexOf(`${spaces}${header}:\n`);
  assert.notEqual(start, -1, `missing ${header} block`);

  const bodyStart = start + indentation + header.length + 2;
  const rest = source.slice(bodyStart);
  const nextHeader = rest.search(new RegExp(`^${spaces}\\S`, "m"));
  return nextHeader === -1 ? rest : rest.slice(0, nextHeader);
}

function eventPaths(onBlock, eventName) {
  const eventBlock = indentedBlock(onBlock, eventName, 2);
  const pathsBlock = indentedBlock(eventBlock, "paths", 4);
  return [...pathsBlock.matchAll(/^ {6}-\s+"([^"]+)"\s*$/gm)].map(
    (match) => match[1],
  );
}

for (const workflow of workflows) {
  test(`${workflow.file} exposes ${workflow.jobName} on pull requests`, async () => {
    const source = await readFile(workflow.file, "utf8");
    const onBlock = indentedBlock(source, "on", 0);
    const jobsBlock = indentedBlock(source, "jobs", 0);

    assert.match(onBlock, /^  push:\s*$/m);
    assert.match(onBlock, /^  pull_request:\s*$/m);
    assert.match(onBlock, /^  workflow_dispatch:\s*$/m);

    const jobBlock = indentedBlock(jobsBlock, workflow.jobId, 2);
    const jobName = jobBlock.match(/^ {4}name:\s+(.+)\s*$/m)?.[1];
    assert.equal(jobName, workflow.jobName);

    if (workflow.mirrorPaths) {
      assert.deepEqual(eventPaths(onBlock, "pull_request"), eventPaths(onBlock, "push"));
    }
  });
}
