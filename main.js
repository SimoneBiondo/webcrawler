import puppeteer from 'puppeteer';
import fs from 'fs'

class ExecutionManager {

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
        if (value.result === "unreachable") {
            this.#currentState.unreachableResults += 1;
        } else if (value.result === "undefined") {
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


const CHUNK_SIZE = 20;
const path_in = process.argv[2];
const path_out = process.argv[3];
const browser = await puppeteer.launch({headless: false});

function streamAsPromise(stream) {
    return new Promise((resolve, reject) => {
        let data = "";        
        stream.on("data", chunk => data += chunk);
        stream.on("end", () => resolve(data));
        stream.on("error", error => reject(error));
    });
}

const text = await streamAsPromise(fs.createReadStream(path_in));
const domains = text.split('\n').map((text) => (text.split(',')[1]).replace("\r", ""));

csvmaker("header", [createDict("fake", "fake")], path_out);
async function fetchResults(domains) {

    const manager = new ExecutionManager();
    const chunks = splitInChunks(domains, CHUNK_SIZE);
    const resolved = []
    const finalStep = (value) => {
        manager.update(value);
        manager.logState(domains.length);
        return value;
    }

    for (const chunk of chunks) {
        const currentResults = await Promise.all(chunk.map(async (domain) => {

            const page = await browser.newPage();
            let value = null;
            try {
                const response = await page.goto("https://" + domain);
                const headers = response.headers();
                value = createDict(domain, headers['strict-transport-security'] ?? "undefined");
            } catch (error) {
                value = createDict(domain, "unreachable")
            } finally {
                await page.close();
            }

            return finalStep(value);
        }));
        
        csvmaker("rows", currentResults, path_out)
        resolved.push(currentResults);
    }
    return resolved.flat();
}

const results = await fetchResults(domains);

browser.disconnect();
browser.close();

function csvmaker(mode, data, name) { 
  
    // Empty array for storing the values 
    const csvRows = []; 
  
    if (mode === "header") {
        const headers = Object.keys(data[0]); 
        csvRows.push(headers.join(','));
        const rowsString = csvRows.join('\n') + '\n';
        fs.writeFile(name, rowsString, 'utf8', function (err) {
            if (err) {
                console.log('Some error occured - file either not saved or corrupted file saved.');
            }
        });
    }
  
    if (mode === "rows") {

        // Pushing Object values into array with comma separation 
        for (const obj of data) {
            const values = Object.values(obj).join(','); 
            csvRows.push(values) 
        }

        const rowsString = csvRows.join('\n') + '\n';
        fs.appendFile(name, rowsString, 'utf8', function (err) {
            if (err) {
                console.log('Some error occured - file either not saved or corrupted file saved.');
            }
        });
    }
} 
  
function createDict(domain, result) { 
  
    // JavaScript object 
    const data = { 
        domain: domain, 
        result: result, 
    };
  
    return data;
}

function splitInChunks(array, size) {

    let currentIndex = 0;
    const chunks = [];

    while (currentIndex <= array.length - 1) {
        chunks.push(array.slice(currentIndex, currentIndex + size));
        currentIndex += size;
    }

    return chunks;
}