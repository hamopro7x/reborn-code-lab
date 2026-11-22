// Signed Bybit REST transport and API-key validation.
import { createHmac } from "crypto";
import { normalizeBybitError, type BybitError } from "./bybit-errors";
import { getCreds, type Creds } from "./bybit-credentials.server";
import { BYBIT_BASE_URL as BASE, BYBIT_RECV_WINDOW as RECV, sleep } from "./bybit-runtime";


