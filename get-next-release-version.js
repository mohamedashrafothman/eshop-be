const packageJson = require("./package.json");
const conventionalRecommendedBump = require("conventional-recommended-bump");
const semver = require("semver");

const getNextVersion = (currentVersion) =>
	new Promise((resolve, reject) => {
		conventionalRecommendedBump({ preset: "angular" }, (err, release) =>
			err
				? reject(err)
				: resolve(semver.valid(release.releaseType) || semver.inc(currentVersion, release.releaseType))
		);
	});

getNextVersion(packageJson.version)
	.then((version) => console.log(version))
	.catch((error) => console.log(error));
