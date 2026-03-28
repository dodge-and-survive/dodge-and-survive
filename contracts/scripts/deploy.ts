import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Base Sepolia test USDC
  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const Factory = await ethers.getContractFactory("StakeAndSurvive");
  const contract = await Factory.deploy(USDC_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ Contract deployed to:", address);
  console.log("USDC:", USDC_ADDRESS);
}

main().catch((e) => { console.error(e); process.exit(1); });
