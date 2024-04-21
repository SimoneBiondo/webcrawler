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

    hasHsts() {
        return this.#hsts !== "undefined"
    }

    buildHstsLevel() {
        return new HstsLevel(this.#hsts);
    }
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

function simpleSearch(results) {

    console.log("\n--- Simple Search ---\n");

    const len = results.length;
    let withHsts = 0;
    let withoutHsts = 0;

    results.forEach((objRes) => {
        if (objRes.hasHsts()) {
            withHsts += 1;
        } else {
            withoutHsts += 1;
        }
    });

    const withHstsStr = `Percentage of HSTS policy compliant domains: ${(withHsts / len * 100).toFixed(2)}%`;
    const withoutHstsStr = `Percentage of HSTS policy noncompliant domains: ${(withoutHsts / len * 100).toFixed(2)}%\n`;
    console.log(withHstsStr);
    console.log(withoutHstsStr);
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

function topLevelHstsSearch(results, topLevelDomains) {

    console.log("\n--- Top Level Search ---\n");

    const topResults = results.filter((res) => {
        return topLevelDomains.includes(res.domainName());
    }).map((res) => {
        return {
            domainName: res.domainName(),
            securityLevel: res.buildHstsLevel().computeSecurityLevel()
        };
    });

    const insecureList = topResults.filter((x) => x.securityLevel.level === -2);
    const badList = topResults.filter((x) => x.securityLevel.level === 0);
    const sufficientList = topResults.filter((x) => x.securityLevel.level === 2);
    const recommendedList = topResults.filter((x) => x.securityLevel.level === 3);

    const total = topResults.length;
    const insecureTotalStr = `Insecure HSTS headers: ${(insecureList.length / total * 100).toFixed(2)}%`;
    const badTotalStr = `Bad HSTS headers: ${(badList.length / total * 100).toFixed(2)}%`;
    const sufficientTotalStr = `Sufficient HSTS headers: ${(sufficientList.length / total * 100).toFixed(2)}%`;
    const recommendedTotalStr = `Recommended HSTS headers: ${(recommendedList.length / total * 100).toFixed(2)}%`;

    console.log(insecureTotalStr);
    console.log(badTotalStr);
    console.log(sufficientTotalStr);
    console.log(recommendedTotalStr);
}

async function analyze(inputPathName, topLevelDomainPathName) {

    const results = await readResults(inputPathName);
    const topLevelDomains = await readTopLevelDomains(topLevelDomainPathName);

    simpleSearch(results);
    topLevelHstsSearch(results, topLevelDomains);
}

await analyze("cleaned-results.csv", "trancopaylevel.csv");