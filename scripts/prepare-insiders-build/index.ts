import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { getChangelog } from "../shared";
import { GitHub, context } from "@actions/github";

function readJsonFile(fileName: string): any {
	const content = readFileSync(fileName, { encoding: "utf-8" });
	return JSON.parse(content);
}

export async function run(): Promise<void> {
	const result = execSync("git status", { encoding: "utf-8" });
	if (result.indexOf("working tree clean") === -1) {
		throw new Error("Working tree is not clean!");
	}

	const v = getChangelog().latestVersion;
	let prerelease: boolean;
	let version: string;
	if (v.kind === "unreleased") {
		console.log(
			"No need to prepare for insiders - version is not released."
		);
		prerelease = false;
		version = "unreleased";
	} else if (!v.version.prerelease) {
		console.log(
			"No need to prepare for insiders - version is not a prerelease."
		);
		prerelease = false;
		version = v.version.toString();
	} else {
		// VS Code does not allow for prerelease numbers. This fixes that.
		const firstPrereleaseNumber =
			(v.version.prerelease.parts.find((p) => typeof p === "number") as
				| number
				| undefined) || 0;
		prerelease = true;
		version = v.version
			.with({
				prerelease: null,
				patch: v.version.patch * 100 + firstPrereleaseNumber,
			})
			.toString();
	}

	const packageJson = readJsonFile(join(__dirname, "../../package.json"));

	const patchPackageJson = readJsonFile(
		join(__dirname, "./package-insiders-build.json")
	);

	let prLink: string | undefined = undefined;
	if (prerelease) {
		const api = new GitHub(process.env.GH_TOKEN!);
		const prs = await api.repos.listPullRequestsAssociatedWithCommit({
			commit_sha: context.sha,
			...context.repo,
		});
		const pr = prs.data[0];
		if (pr) {
			prLink = pr.url;
		}
	}

	if (prerelease) {
		Object.assign(packageJson, patchPackageJson);
	}
	Object.assign(packageJson, { version });

	writeFileSync(
		join(__dirname, "../../package.json"),
		JSON.stringify(packageJson, undefined, 4)
	);

	if (prerelease) {
		let content = readFileSync(
			join(__dirname, "./README_INSIDERS_BUILD.md"),
			{
				encoding: "utf-8",
			}
		);
		content = content.replace(/\$commit-sha\$/g, context.sha);
		if (prLink) {
			content = content.replace(/\$pr-link\$/g, prLink);
		}
		writeFileSync(join(__dirname, "../../README.md"), content);
	}
}
