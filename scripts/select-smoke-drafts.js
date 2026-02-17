#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEFAULT_DRAFTS_DIR = path.join(process.cwd(), 'drafts');

function listDraftFiles(draftsDir) {
    if (!fs.existsSync(draftsDir)) {
        return [];
    }
    return fs
        .readdirSync(draftsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name)
        .sort()
        .reverse();
}

function pickSmokeDrafts(filenames) {
    const ko = filenames.find((name) => /-ko\.md$/i.test(name));
    const en = filenames.find((name) => !/-ko\.md$/i.test(name));
    const selected = [];
    if (en) selected.push(path.join('drafts', en));
    if (ko) selected.push(path.join('drafts', ko));
    return selected;
}

function writeOutput({ files }) {
    const outputPath = process.env.GITHUB_OUTPUT;
    const hasFiles = files.length > 0;

    if (!outputPath) {
        console.log(
            JSON.stringify(
                {
                    hasFiles,
                    fileCount: files.length,
                    files
                },
                null,
                2
            )
        );
        return;
    }

    const lines = [];
    lines.push(`has_files=${hasFiles ? 'true' : 'false'}`);
    lines.push(`file_count=${files.length}`);
    if (hasFiles) {
        lines.push('files<<EOF');
        lines.push(files.join('\n'));
        lines.push('EOF');
    }
    fs.appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
    const draftsDir = process.env.DRAFTS_DIR || DEFAULT_DRAFTS_DIR;
    const files = listDraftFiles(draftsDir);
    const selected = pickSmokeDrafts(files);

    if (selected.length === 0) {
        console.error('::error::No draft markdown files found for smoke publish.');
        process.exit(1);
    }

    console.error(`[select-smoke-drafts] Selected ${selected.length} draft file(s): ${selected.join(', ')}`);
    writeOutput({ files: selected });
}

if (require.main === module) {
    main();
}

module.exports = {
    listDraftFiles,
    pickSmokeDrafts,
    writeOutput,
    main
};
