import * as fs from 'fs';


interface DeploymentInfo {
    contractName: string;
    contractAddress: string;
    implementationAddress?: string;
    timestamp: number;
}

export function writeToDeploymentsFile(deployment: DeploymentInfo, network: string): void {
    const fileName = `deployments/deployments-${network}.json`;
    const existingDeployments: DeploymentInfo[] = readDeploymentsFromNetwork(network);
    existingDeployments.push(deployment);
    const data = JSON.stringify(existingDeployments, null, 2);
    fs.writeFileSync(fileName, data);
}

export function readDeploymentsFromNetwork(network: string): DeploymentInfo[] {
    const fileName = `deployments/deployments-${network}.json`;
    try {
        const data = fs.readFileSync(fileName, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

export function getMostCurrentContract(contractNameToRead: string, network: string): DeploymentInfo {
    const deployments = readDeploymentsFromNetwork(network);

    // Filter deployments by the provided contractNameToRead
    const filteredDeployments = deployments.filter((deployment) => deployment.contractName === contractNameToRead);

    // Find the most recent deployment based on the timestamp
    const mostRecentDeployment = filteredDeployments.reduce((prevDeployment, currentDeployment) => {
        return currentDeployment.timestamp > prevDeployment.timestamp ? currentDeployment : prevDeployment;
    }, filteredDeployments[0]);

    return mostRecentDeployment;
}