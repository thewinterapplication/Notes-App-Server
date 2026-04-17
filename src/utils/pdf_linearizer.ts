import { spawn } from "child_process";
import { writeFile, readFile, readdir, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

// Resolution order: QPDF_PATH env var -> platform default
// Linux (production): install with `apt install qpdf`
// Windows (dev): installed via `winget install qpdf.qpdf`
function resolveQpdfPath(): string {
    if (process.env.QPDF_PATH) {
        return process.env.QPDF_PATH;
    }
    if (process.platform === "win32") {
        return "C:\\Program Files\\qpdf 12.3.2\\bin\\qpdf.exe";
    }
    return "qpdf";
}

const QPDF_PATH = resolveQpdfPath();

/**
 * Splits a PDF into individual single-page PDFs using qpdf --split-pages.
 * Returns an array of Buffers, one per page, in page order.
 * Throws if qpdf is unavailable or the PDF cannot be split.
 */
export async function splitIntoPages(inputBuffer: Buffer): Promise<Buffer[]> {
    const id = randomBytes(8).toString("hex");
    const tmpIn = join(tmpdir(), `pdf_split_in_${id}.pdf`);
    // qpdf inserts page number before .pdf: pdf_split_out_<id>-01.pdf, etc.
    const tmpOutBase = join(tmpdir(), `pdf_split_out_${id}.pdf`);
    const startedAt = Date.now();

    let pageCount = 0;
    try {
        console.log(`[pdf-split] start id=${id} inputBytes=${inputBuffer.length} qpdf="${QPDF_PATH}"`);
        await writeFile(tmpIn, inputBuffer);

        await new Promise<void>((resolve, reject) => {
            const proc = spawn(QPDF_PATH, ["--split-pages", tmpIn, tmpOutBase]);
            let stderr = "";
            proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
            proc.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`qpdf --split-pages exited with code ${code}: ${stderr.trim()}`));
            });
            proc.on("error", (err) => {
                reject(new Error(`Failed to start qpdf at "${QPDF_PATH}": ${err.message}`));
            });
        });

        // qpdf names output files: pdf_split_out_<id>-01.pdf, ...-80.pdf etc.
        // Use readdir to find them all regardless of zero-padding width.
        const prefix = `pdf_split_out_${id}-`;
        const allFiles = await readdir(tmpdir());
        const pageFiles = allFiles
            .filter(f => f.startsWith(prefix) && f.endsWith(".pdf"))
            .sort(); // lexicographic sort = correct page order with zero-padding

        const pages: Buffer[] = [];
        for (const f of pageFiles) {
            pages.push(await readFile(join(tmpdir(), f)));
        }
        pageCount = pages.length;

        console.log(`[pdf-split] complete id=${id} pages=${pageCount} durationMs=${Date.now() - startedAt}`);
        return pages;
    } catch (error) {
        console.error(`[pdf-split] failed id=${id} inputBytes=${inputBuffer.length} durationMs=${Date.now() - startedAt}`, error);
        throw error;
    } finally {
        await unlink(tmpIn).catch(() => {});
        // Clean up all generated page files
        try {
            const prefix = `pdf_split_out_${id}-`;
            const allFiles = await readdir(tmpdir());
            await Promise.all(
                allFiles
                    .filter(f => f.startsWith(prefix) && f.endsWith(".pdf"))
                    .map(f => unlink(join(tmpdir(), f)).catch(() => {}))
            );
        } catch { }
    }
}

export async function linearizePdf(inputBuffer: Buffer): Promise<Buffer> {
    const id = randomBytes(8).toString("hex");
    const tmpIn = join(tmpdir(), `pdf_in_${id}.pdf`);
    const tmpOut = join(tmpdir(), `pdf_out_${id}.pdf`);
    const startedAt = Date.now();

    try {
        console.log(`[pdf-linearizer] start id=${id} inputBytes=${inputBuffer.length} qpdf="${QPDF_PATH}"`);
        await writeFile(tmpIn, inputBuffer);

        await new Promise<void>((resolve, reject) => {
            const proc = spawn(QPDF_PATH, ["--linearize", tmpIn, tmpOut]);
            let stderr = "";
            proc.stderr?.on("data", (chunk: Buffer) => {
                stderr += chunk.toString();
            });
            proc.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`qpdf exited with code ${code}: ${stderr.trim()}`));
                }
            });
            proc.on("error", (err) => {
                reject(new Error(`Failed to start qpdf at "${QPDF_PATH}": ${err.message}. On Linux run: apt install qpdf`));
            });
        });

        const outputBuffer = await readFile(tmpOut);
        console.log(`[pdf-linearizer] complete id=${id} outputBytes=${outputBuffer.length} durationMs=${Date.now() - startedAt}`);
        return outputBuffer;
    } catch (error) {
        console.error(`[pdf-linearizer] failed id=${id} inputBytes=${inputBuffer.length} durationMs=${Date.now() - startedAt}`, error);
        throw error;
    } finally {
        await Promise.all([
            unlink(tmpIn).catch(() => {}),
            unlink(tmpOut).catch(() => {}),
        ]);
    }
}
