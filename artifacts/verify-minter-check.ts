import { verifyAuthorizedMinter } from "../packages/xrpl/src/verify-minter.js";

async function main() {
  const r = await verifyAuthorizedMinter(
    "rpvoajJ4mbnorub6W8MFBEtfkeFaMTCPBX",
    "rn64Djcp45J7GkpuMKM9DsfXMTSyY6qdMh",
    "testnet"
  );
  console.log(JSON.stringify(r, null, 2));
}
main();
