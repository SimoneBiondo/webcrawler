import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs'

// Logger
class Logger {

    #ANSI_RESET = '\x1b[0m';
    #ANSI_COLOR_RED = '\x1b[31m';
    #ANSI_COLOR_GREEN = '\x1b[32m';
    #ANSI_COLOR_YELLOW = '\x1b[33m';

    #currentState = {
        validResults: 0, 
        undefinedResults: 0, 
        unreachableResults: 0
    };

    update(value) {
        if (value.hsts === "NA") {
            this.#currentState.unreachableResults += 1;
        } else if (value.hsts === "undefined") {
            this.#currentState.undefinedResults += 1;
        } else {
            this.#currentState.validResults += 1;
        }
    }

    logState(totalData) {

        const state = this.#currentState;
        const validResults = `Valid results: ${this.#ANSI_COLOR_GREEN}${state.validResults}${this.#ANSI_RESET}`;
        const undefinedResults = `Undefined results: ${this.#ANSI_COLOR_RED}${state.undefinedResults}${this.#ANSI_RESET}`;
        const unreachableResults = `Unreachable results: ${this.#ANSI_COLOR_YELLOW}${state.unreachableResults}${this.#ANSI_RESET}`;
        const sum = state.undefinedResults + state.unreachableResults + state.validResults;

        process.stdout.write("\r\x1b[K");
        process.stdout.write(`${validResults}; ${undefinedResults}; ${unreachableResults} (${sum / totalData * 100}%)`);
    }
}

async function extractDomainsFromCsv(inputPathName) {

    const streamAsPromise = (stream) => {
        return new Promise((resolve, reject) => {
            let data = "";        
            stream.on("data", chunk => data += chunk);
            stream.on("end", () => resolve(data));
            stream.on("error", error => reject(error));
        });
    }

    const text = await streamAsPromise(fs.createReadStream(inputPathName));
    const domains = text.replace('\r', '').split('\n').map((row) => row.split(',')[1]);
    return domains;
}

async function createCsvHeader(outputhPathName) {

    const writeFileAsPromise = (row) => {
        return new Promise((resolve, reject) => {
            fs.writeFile(outputhPathName, row, 'utf8', function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(null);
                }
            });
        })
    }

    await writeFileAsPromise('domain, hsts\n')
}

async function appendRows(outputhPathName, rows) {

    const csvRows = [];
    for (const row of rows) {
        const values = Object.values(row).join(','); 
        csvRows.push(values) 
    }

    const rowsString = csvRows.join('\n') + '\n';
    await new Promise((resolve, reject) => {
        fs.appendFile(outputhPathName, rowsString, 'utf8', function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(null);
            }
        });
    })
}

function createDict(domain, hsts) {
    return {
        domain: domain, 
        hsts: hsts
    }
}

function splitter(domains, size) {

    let currentIndex = 0;
    const chunks = [];
    while (currentIndex <= domains.length - 1) {
        chunks.push(domains.slice(currentIndex, currentIndex + size));
        currentIndex += size;
    }
    return chunks;
}

async function extractHSTS(domains, outputhPathName, size) {

    const createChunksOfPromises = (domainChunk) => {
        return Promise.all(domainChunk.map(async (domain) => {
            const page = await browser.newPage();
            let value = null;
            try {
                const response = await page.goto("https://" + domain, { timeout: 60000, waitUntil: 'networkidle2' });
                const headers = response.headers();
                value = createDict(domain, headers['strict-transport-security'] ?? "undefined");
            } catch (error) {
                value = createDict(domain, "NA")
            } finally {
                await page.close();
            }
            return value;
        }));
    }

    const logger = new Logger();
    const browser = await puppeteer.launch({
        headless: true, 
        timeout: 15000
    });

    const chunks = splitter(domains, size);
    await createCsvHeader(outputhPathName);
    
    for (const chunk of chunks) {
        const results = await createChunksOfPromises(chunk);
        results.forEach((res) => logger.update(res));
        logger.logState(domains.length);
        await appendRows(outputhPathName, results);
    }

    await browser.close();
}

async function axiosResults(domains) {

    const logger = new Logger();
    const chunks = splitter(domains, 20);

    await createCsvHeader("axiosResults.csv");

    for (const chunk of chunks) {

        const currentResults = await Promise.all(chunk.map(async (d) => {
            let res = null;
            try {
                const resp = await axios.get("https://" + d);
                res = createDict(d, resp.headers['strict-transport-security'] ?? "undefined");
            } catch (error) {
                res = createDict(d, "NA")
            }
            return res;
        }));

        currentResults.forEach((res) => logger.update(res));
        logger.logState(domains.length);
        await appendRows("axiosResults.csv", currentResults);
    }

}

async function fetchResults(domains) {

    const logger = new Logger();
    const chunks = splitter(domains, 20);

    await createCsvHeader("fetchResults.csv");

    for (const chunk of chunks) {

        const currentResults = await Promise.all(chunk.map(async (d) => {
            let res = null;
            try {
                const resp = await fetch("https://" + d);
                res = createDict(d, resp.headers.get('strict-transport-security') ?? "undefined");
            } catch (error) {
                res = createDict(d, "NA")
            }
            return res;
        }));

        currentResults.forEach((res) => logger.update(res));
        logger.logState(domains.length);
        await appendRows("fetchResults.csv", currentResults);
    }

}

async function runTest(inputPathName, outputhPathName) {

    const CHUNK_SIZE = 20;
    const domains = await extractDomainsFromCsv(inputPathName);

    console.log("\n--- PUPPETEER ---\n");
    await extractHSTS(domains, outputhPathName, CHUNK_SIZE);

    console.log("\n--- AXIOS ---\n");
    await axiosResults(domains);

    console.log("\n--- FETCH ---\n");
    await fetchResults(domains);

    console.log("\n")
}

async function execProgram(inputPathName, outputhPathName) {

    await runTest(inputPathName, outputhPathName);
}

await execProgram(process.argv[2], process.argv[3]);
process.exit(1);