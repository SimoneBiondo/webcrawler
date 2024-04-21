import fs from 'fs'

function filterData(results) {
    return results.filter((resObject) => resObject.reachable).map((obj) => {
        return {
            host: obj.host,
            hsts: obj.hsts
        }
    });
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
        const value = data[1];
        const reachable = value !== "NA";
        return {
            host: data[0],
            reachable: reachable, 
            hsts: reachable ? value : null
        }
    });

    return domains.slice(1);
}

async function createCsvHeader(outputhPathName, columnNames) {

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

    await writeFileAsPromise(columnNames.join(',') + "\n")
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

async function writeResults(outputhPathName, columnNames, results) {

    await createCsvHeader(outputhPathName, columnNames);
    await appendRows(outputhPathName, results);
}

async function removeUselessData(inputPathName, outputhPathName) {

    const results = await readResults(inputPathName);
    const filteredData = filterData(results);
    console.log(filteredData);
    await writeResults(outputhPathName, ["Domain, HSTS"], filteredData);
}

await removeUselessData("test-results.csv", "cleaned-results.csv");