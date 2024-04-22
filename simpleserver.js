import express from "express";
import fs from 'fs'

class HstsLevel {

    #hstsString;
    #securityLevel;

    constructor(hstsString) {
        this.#hstsString = hstsString;
        this.#buildInfo();
    }

    computeSecurityLevel() {
        return this.#securityLevel;
    }

    #buildInfo() {
        this.#securityLevel = this.#buildFromStr(this.#hstsString);
    }

    #buildFromStr(str) {

        const strArray = str.split(';').map((value) => value.trim());
        const len = strArray.length;
        
        if (len >= 1 && len <= 3) {
    
            // Parse only string array where len is from 1 to 3
            const parsedStr = this.#parseStr(strArray, 0);

            if (parsedStr) {
                return this.#mapLevel(this.#levelFrom(parsedStr));
            } else {
                return this.#mapLevel(-2);
            }
        } else {
    
            // Unable to parse
            return this.#mapLevel(-2);
        };
    }

    #mapLevel(level) {
        switch (level) {
            case 0:
                return {
                    label: "Bad", 
                    level: level
                };
            case 2:
                return {
                    label: "Sufficient", 
                    level: level
                };
            case 3:
                return {
                    label: "Recommended", 
                    level: level
                };
            default:
                return {
                    label: "Insecure", 
                    level: level
                };
            };
    }

    #levelFrom(obj) {

        const atLeastOneYear = obj.atLeastOneYear;
        const includeSub = obj.includeSubDomains;
        const hasPreload = obj.preload;
    
        const p1 = atLeastOneYear ? 1 : -1;
        const p2 = includeSub ? 1 : -1;
        const p3 = atLeastOneYear && includeSub && hasPreload ? 1 : 0
    
        return p1 + p2 + p3;
    }

    #parseStr(strArray, index) {

        if (index >= strArray.length) {
            return null;
        }
    
        const partToCombine = this.#parseStr(strArray, index + 1);
        const partToParse = strArray[index];
    
        if (this.#isMaxAge(partToParse)) {
            return this.#merge({
                atLeastOneYear: this.#atLeastOneYear(partToParse)
            }, partToCombine);
        } else if (this.#isSubdomains(partToParse)) {
            return this.#merge({
                includeSubDomains: true
            }, partToCombine);
        } else if (this.#isPreload(partToParse)) {
            return this.#merge({
                preload: true
            }, partToCombine);
        }
    }

    #isMaxAge(part) {
        return part.toLowerCase().startsWith("max-age=");
    }
    
    #isSubdomains(part) {
        return part.toLowerCase() === "includeSubDomains".toLowerCase();
    }
    
    #isPreload(part) {
        return part.toLowerCase() === "preload".toLowerCase();
    }
    
    #atLeastOneYear(part) {
        return parseInt(part.split('=')[1]) >= 31536000
    }
    
    #merge(objOne, objTwo) {
        return {
            ...objOne, ...objTwo
        }
    }

}

class Result {

    #domainName;
    #hsts;

    constructor(objRes) {
        this.#domainName = objRes.host;
        this.#hsts = objRes.hsts;
    }

    domainName() {
        return this.#domainName;
    }

    hstsString() {
        return this.#hsts;
    }

    hasHsts() {
        return this.#hsts !== "undefined"
    }

    buildHstsLevel() {
        return new HstsLevel(this.#hsts);
    }
}

async function readTopLevelDomains(topLevelDomainPathName) {

    const streamAsPromise = (stream) => {
        return new Promise((resolve, reject) => {
            let data = "";        
            stream.on("data", chunk => data += chunk);
            stream.on("end", () => resolve(data));
            stream.on("error", error => reject(error));
        });
    }

    const text = await streamAsPromise(fs.createReadStream(topLevelDomainPathName));
    const domains = text.replace('\r', '').split('\n').map((row) => row.split(',')[1].replace('\r', ''));
    return domains;
}

async function readResults(inputPathName) {

    const streamAsPromise = (stream) => {
        return new Promise((resolve, reject) => {
            let data = "";        
            stream.on("data", chunk => data += chunk);
            stream.on("end", () => resolve(data));
            stream.on("error", error => reject(error));
        });
    }

    const text = await streamAsPromise(fs.createReadStream(inputPathName));
    const domains = text.replace('\r', '').split('\n').map((row) => {
        const data = row.replace('\r', '').split(',');
        return new Result({
            host: data[0], 
            hsts: data[1]
        });
    });

    return domains.slice(1);
}

const app = express();
const port = 3000;

const payLevelDomains = await readTopLevelDomains("trancopaylevel.csv");
const results = await readResults("cleaned-results.csv");

app.get('/', (req, res) => {
  res.send('Web measurement - 2023/2024');
});

function extractPayLevelDomain(req) {
    return req.query.domain;
}

function isPayLevelDomain(domain) {
    return payLevelDomains.includes(domain);
}

function filterResults(payLevelDomain) {
    return results.filter((result) => {
        return result.domainName().endsWith(payLevelDomain);
    });
}

function formatResults(filteredResults) {
    return filteredResults.map((result) => {
        const lvl = result.buildHstsLevel().computeSecurityLevel();
        return `Domain name: ${result.domainName()}, HSTS string: ${result.hstsString()}, security level: (label=${lvl.label}; level=${lvl.level})`;
    });
}

app.get('/fetch', (req, res) => {

    const payLevelDomain = extractPayLevelDomain(req);
    
    if (isPayLevelDomain(payLevelDomain)) {

        const filteredResults = filterResults(payLevelDomain);

        if (filteredResults.length > 0) {
            const formattedResults = formatResults(filteredResults);
            res.send(formattedResults);
        } else {
            res.send(`Unavailable results for ${payLevelDomain}`);
        }
    } else {

        res.send(`Domain ${payLevelDomain} is not a valid pay-level domain.`);
    }
});

function filterByLevel(level) {

    return results.filter((result) => {
        const lvl = result.buildHstsLevel().computeSecurityLevel();
        return lvl.level === level
    })
}

app.get('/insecure', (req, res) => {
    res.send(formatResults(filterByLevel(-2)));
});

app.get('/bad', (req, res) => {
    res.send(formatResults(filterByLevel(0)));
});

app.get('/sufficient', (req, res) => {
    res.send(formatResults(filterByLevel(2)));
});

app.get('/recommended', (req, res) => {
    res.send(formatResults(filterByLevel(3)));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});