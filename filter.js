import fs from 'fs'

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

    await writeFileAsPromise('num, domain\n')
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
    const domains = text.replace('\r', '').split('\n').map((row) => row.split(',')[1].replace('\r', ''));
    return domains;
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

async function extractReasonableDomainsOpt(payLevelDomainPath, domainsPath, atLeastSubdomains) {

    await createCsvHeader("filteredTrancoList.csv");
    const payLevelDomains = await extractDomainsFromCsv(payLevelDomainPath);
    const domains = await extractDomainsFromCsv(domainsPath);
    const subdomains = deleteFirstFromSecond(payLevelDomainPath, domains);

    let line = 1;
    let index = 1;
    let total = 0;

    const payChunks = splitter(payLevelDomains, 100);

    for (const chunk of payChunks) {

        const domainsWithAtLeastOneSub = chunk.map((payLevelDomain) => {

            const filtered = subdomains.filter((subdomain) => subdomain.endsWith(`.${payLevelDomain}`));
            const count = filtered.length;
            total = count >= atLeastSubdomains ? total + 1 : total;
    
            process.stdout.write("\r\x1b[K");
            process.stdout.write(`Line=${line++} Total=${total}`);
    
            if (count >= atLeastSubdomains) {
                return filtered.map((d) => {
                    return {
                        domain: payLevelDomain,
                        subdomain: d
                    }
                });
            } else {
                return null
            }
        });

        const nonNull = domainsWithAtLeastOneSub.filter((x) => x != null);

        const flattenObjects = nonNull.map((values) => {
            const topLevel = values[0].domain;
            const flatten = [topLevel];
            
            for (const value of values) {
                flatten.push(value.subdomain);
            }
            
            return flatten;
        });
    
        const flattenList = flattenObjects.flat();

        const objectsToWrite = flattenList.map((o) => {
            return {
                one: index++,
                two: o
            };
        });

        await appendRows("filteredTrancoList.csv", objectsToWrite);
    }
}

function deleteFirstFromSecond(firstList, secondList) {
    return secondList.filter((elem) => {
        return !firstList.includes(elem);
    })
}

await extractReasonableDomainsOpt("trancopaylevel.csv", "trancosub.csv", 1);