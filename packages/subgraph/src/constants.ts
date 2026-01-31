import { BigDecimal, BigInt } from "@graphprotocol/graph-ts/index";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const CORE_ADDRESS = "0xb18239c80DB00213fA760Becb9892ff36CB9c7E1";
export const DIRECTORY_ID = "directory";

export const ZERO_BI = BigInt.fromI32(0);
export const ONE_BI = BigInt.fromI32(1);
export const ZERO_BD = BigDecimal.fromString("0");
export const ONE_BD = BigDecimal.fromString("1");
export const BI_18 = BigInt.fromI32(18);
export const BI_6 = BigInt.fromI32(6);

export const SECONDS_PER_HOUR: i32 = 3600;
export const SECONDS_PER_DAY: i32 = 86400;
export const SECONDS_PER_MINUTE: i32 = 60;

// Fee constants (basis points)
export const OWNER_FEE = BigInt.fromI32(8000); // 80%
export const CREATOR_FEE = BigInt.fromI32(300); // 3%
export const TEAM_FEE = BigInt.fromI32(100); // 1%
export const PROTOCOL_FEE = BigInt.fromI32(100); // 1%
export const TREASURY_FEE = BigInt.fromI32(1500); // 15% (remainder)
export const DIVISOR = BigInt.fromI32(10000);
