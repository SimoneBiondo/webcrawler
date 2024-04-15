function splitInChunks(array, size) {

    let currentIndex = 0;
    const chunks = [];

    while (currentIndex <= array.length - 1) {
        chunks.push(array.slice(currentIndex, currentIndex + size));
        currentIndex += size;
    }

    return chunks;
}

const b = []
const a = splitInChunks([1, 3, 4, 5], 2);

for (const elem of a) {
    b.push(elem);
}

console.log(b.flat());
console.log("\n")

class ExecutionManager {

    #currentState = {
        validResults: 0, 
        undefinedResults: 0, 
        unreachableResults: 0
    }

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
        const validResults = `Valid results: ${state.validResults}`;
        const undefinedResults = `Valid results: ${state.undefinedResults}`;
        const unreachableResults = `Valid results: ${state.unreachableResults}`;
        const sum = state.undefinedResults + state.unreachableResults + state.validResults;

        process.stdout.write("\r\x1b[K");
        process.stdout.write(`${validResults}; ${undefinedResults}; ${unreachableResults} (${sum / totalData * 100}%)`);
    }
}

function logResult(result) {

    if (result.value === "unreachable") {

    } else if (result.value === "undefined") {

    } else {

    }
}

[1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(elem => {
    process.stdout.write("\r\x1b[K")
    process.stdout.write(`Data left: ${elem}%`)
})

process.stdout.write("000");
process.stdout.write("\n111");
process.stdout.write("\n222");
process.stdout.write("\r\x1b[K")
process.stdout.write("333");