import puppeteer from 'puppeteer';
import fs from 'fs'


const path = "./test.csv";
const browser = await puppeteer.launch();

function streamAsPromise(stream) {
    return new Promise((resolve, reject) => {
        let data = "";        
        stream.on("data", chunk => data += chunk);
        stream.on("end", () => resolve(data));
        stream.on("error", error => reject(error));
    });
}

const text = await streamAsPromise(fs.createReadStream(path));
const domains = text.split('\n').map((text) => text.split(',')[1]);

async function fetchResults(domains) {
    return await Promise.all(domains.map(async (domain) => {
        try {
            const page = await browser.newPage();
            const response = await page.goto("https://" + domain);
            const headers = response.headers();
            return createDict(domain, headers['strict-transport-security'] ?? "undefined");
        } catch (error) {
            return createDict(domain, "unreachable")
        }
    }));
}

const results = await fetchResults(domains);

browser.disconnect();
browser.close();
csvmaker(results, "results.csv", () => process.exit());

function csvmaker(data, name, onwrite) { 
  
    // Empty array for storing the values 
    const csvRows = []; 
  
    const headers = Object.keys(data[0]); 
    csvRows.push(headers.join(',')); 
  
    // Pushing Object values into array with comma separation 
    for (const obj of data) {
        const values = Object.values(obj).join(','); 
        csvRows.push(values) 
    }

    const rowsString = csvRows.join('\n');

    fs.writeFile(name, rowsString, 'utf8', function (err) {
        if (err) {
            console.log('Some error occured - file either not saved or corrupted file saved.');
            onwrite();
        } else{
          console.log('It\'s saved!');
          onwrite();
        }
    });
} 
  
function createDict(domain, result) { 
  
    // JavaScript object 
    const data = { 
        domain: domain, 
        result: result, 
    };
  
    return data;
}