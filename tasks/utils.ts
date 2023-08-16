import * as readline from 'readline-sync';

export async function retryableRequest(reqFunc: () => Promise<void>): Promise<void> {
    try {
        await reqFunc();
    } catch (error) {
        console.error(error);
        if (readline.keyInYN('An error occurred. Do you want to retry?')) {
            await retryableRequest(reqFunc);
        } else {
            console.log("Skipping request...")
        }
    }
}

export function getNumber(maxLength: number): number {
    let numStr: string;

    do {
        numStr = readline.question('Please enter starting index: ');
    } while (Number(numStr) > maxLength || isNaN(Number(numStr)));

    return Number(numStr);
}