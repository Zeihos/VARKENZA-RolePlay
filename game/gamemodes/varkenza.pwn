#include <open.mp>

// VARKENZA RolePlay - game alpha v0.11. Requires local website bridge to link characters.
// Set the SAME URL-safe bridge secret as web/.env. Never ship compiled AMX to untrusted users.
#define VK_BRIDGE_URL "127.0.0.1:3000"
#define VK_BRIDGE_SECRET "REPLACE_WITH_UNIQUE_LOCAL_GAME_BRIDGE_SECRET"
#define VK_PING_SECONDS 45
#define VK_ACTION_NONE (0)
#define VK_ACTION_LINK (1)
#define VK_ACTION_JOB (2)
#define VK_ACTION_WORK (3)
#define VK_ACTION_PING (4)
#define VK_ACTION_REPORT (5)
#define VK_ACTION_ACK (6)
#define VK_ACTION_POSITION (7)
#define VK_ACTION_STAFF_LINK (8)
#define VK_ACTION_STAFF_COMMAND (9)
#define VK_ACTION_STAFF_OFF (10)
#define VK_ACTION_GARAGE (11)
#define VK_ACTION_CAR_STATE (12)
#define VK_ACTION_BANK (13)
#define VK_ACTION_PAY (14)
#define VK_REQUEST_TIMEOUT_MS (20000)
#define VK_STAFF_GOTO (1)
#define VK_STAFF_GETHERE (2)
#define VK_STAFF_FREEZE (3)
#define VK_STAFF_UNFREEZE (4)
#define VK_STAFF_SPEC (5)
#define VK_STAFF_SPECOFF (6)
#define VK_STAFF_VEH (7)
#define VK_STAFF_CHAT (8)
#define VK_WHITE    (0xF7F7F7FF)
#define VK_ORANGE   (0xFF9834FF)
#define VK_GREY     (0xCAC3C3FF)
#define VK_GREEN    (0x88DB93FF)
#define VK_RED      (0xFF8181FF)
#define VK_PURPLE   (0xCB9EFFFF)
#define VK_JOB_NONE (0)
#define VK_JOB_COURIER (1)
#define VK_JOB_MECHANIC (2)
#define VK_JOB_TAXI (3)
// Work cooldown and cash awards are authoritative on the website bridge.

new PlayerJob[MAX_PLAYERS];
new bool:PlayerLinked[MAX_PLAYERS];
new PlayerEpoch[MAX_PLAYERS];
new PlayerRequestSeq[MAX_PLAYERS];
new PlayerPendingIndex[MAX_PLAYERS];
new PlayerPendingSince[MAX_PLAYERS];
new PlayerPayTarget[MAX_PLAYERS];
new PlayerPayTargetEpoch[MAX_PLAYERS];
new PlayerPayTargetSID[MAX_PLAYERS][49];
new PlayerAction[MAX_PLAYERS];
new PlayerCash[MAX_PLAYERS];
new PlayerBank[MAX_PLAYERS];
new PlayerLevel[MAX_PLAYERS];
new PlayerSkin[MAX_PLAYERS];
new PlayerSID[MAX_PLAYERS][49];
new bool:PlayerStaff[MAX_PLAYERS];
new PlayerStaffCommand[MAX_PLAYERS];
new PlayerStaffTarget[MAX_PLAYERS];
new PlayerStaffTargetEpoch[MAX_PLAYERS];
new PlayerStaffTargetSID[MAX_PLAYERS][49];
new PlayerGarageVehicle[MAX_PLAYERS];
new bool:PlayerCarEngine[MAX_PLAYERS];
new bool:PlayerCarLocked[MAX_PLAYERS];
new PlayerCarFuel[MAX_PLAYERS];
new PlayerCarCapacity[MAX_PLAYERS];
new PlayerCarHealth[MAX_PLAYERS];
new PlayerCarAction[MAX_PLAYERS][16];
new PlayerStaffVehicle[MAX_PLAYERS];
new PlayerStaffVehModel[MAX_PLAYERS];
new PlayerStaffMessage[MAX_PLAYERS][110];
new bool:PlayerManualSave[MAX_PLAYERS];
new bool:PlayerSpectating[MAX_PLAYERS];
new bool:PlayerReturnSpec[MAX_PLAYERS];
new Float:PlayerReturnX[MAX_PLAYERS], Float:PlayerReturnY[MAX_PLAYERS], Float:PlayerReturnZ[MAX_PLAYERS];
new PlayerReturnInterior[MAX_PLAYERS], PlayerReturnWorld[MAX_PLAYERS];
new bool:PlayerRestorePosition[MAX_PLAYERS];
new Float:PlayerSavedX[MAX_PLAYERS], Float:PlayerSavedY[MAX_PLAYERS], Float:PlayerSavedZ[MAX_PLAYERS];
new Float:PlayerSavedA[MAX_PLAYERS];
new PlayerSavedInterior[MAX_PLAYERS], PlayerSavedWorld[MAX_PLAYERS];

forward VarkenzaLinkReply(index, response_code, data[]);
forward VarkenzaJobReply(index, response_code, data[]);
forward VarkenzaWorkReply(index, response_code, data[]);
forward VarkenzaPingReply(index, response_code, data[]);
forward VarkenzaReportReply(index, response_code, data[]);
forward VarkenzaIgnored(index, response_code, data[]);
forward VarkenzaHeartbeat();
forward VarkenzaCheckRequests();
forward VarkenzaPayReply(index, response_code, data[]);
forward VarkenzaAckReply(index, response_code, data[]);
forward VarkenzaDelayedKick(index);
forward VarkenzaPositionReply(index, response_code, data[]);
forward VarkenzaStaffLinkReply(index, response_code, data[]);
forward VarkenzaStaffCommandReply(index, response_code, data[]);
forward VarkenzaStaffOffReply(index, response_code, data[]);
forward VarkenzaGarageReply(index, response_code, data[]);
forward VarkenzaCarStateReply(index, response_code, data[]);
forward VarkenzaBankReply(index, response_code, data[]);

main() {
    print("=============================================");
    print("    VARKENZA ROLEPLAY | Gameplay alpha v0.11");
    print("    Character link + server-authoritative shift prototype");
    print("=============================================");
}

public OnGameModeInit() {
    SetGameModeText("VARKENZA ROLEPLAY | ALPHA");
    ManualVehicleEngineAndLights();
    // Test spawn at Los Santos downtown.
    AddPlayerClass(26, 1481.0164, -1737.8495, 13.5469, 91.0, 0, 0, 0, 0, 0, 0);
    ShowNameTags(true);
    EnableStuntBonusForAll(false);
    SetTimer("VarkenzaHeartbeat", VK_PING_SECONDS * 1000, true);
    SetTimer("VarkenzaCheckRequests", 5000, true);
    return 1;
}

public OnPlayerConnect(playerid) {
    PlayerJob[playerid] = VK_JOB_NONE;
    PlayerLinked[playerid] = false;
    PlayerAction[playerid] = VK_ACTION_NONE;
    PlayerPendingIndex[playerid] = -1;
    PlayerPayTarget[playerid] = INVALID_PLAYER_ID;
    PlayerPayTargetSID[playerid][0] = 0;
    PlayerEpoch[playerid]++;
    PlayerCash[playerid] = 0;
    PlayerBank[playerid] = 0;
    PlayerLevel[playerid] = 1;
    PlayerSkin[playerid] = 26;
    PlayerSID[playerid][0] = 0;
    PlayerStaff[playerid] = false;
    PlayerStaffCommand[playerid] = 0;
    PlayerStaffTarget[playerid] = INVALID_PLAYER_ID;
    PlayerStaffTargetSID[playerid][0] = 0;
    PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;
    PlayerGarageVehicle[playerid] = INVALID_VEHICLE_ID;
    PlayerCarEngine[playerid] = false;
    PlayerCarLocked[playerid] = true;
    PlayerCarFuel[playerid] = 0;
    PlayerCarCapacity[playerid] = 60;
    PlayerCarHealth[playerid] = 1000;
    PlayerStaffVehModel[playerid] = 0;
    PlayerSpectating[playerid] = false;
    PlayerReturnSpec[playerid] = false;
    PlayerRestorePosition[playerid] = false;
    PlayerManualSave[playerid] = false;
    SendClientMessage(playerid, VK_ORANGE, "VARKENZA ROLEPLAY | Alpha v0.11");
    SendClientMessage(playerid, VK_WHITE, "Create your character on the website, then enter with the SAME RP nickname.");
    SendClientMessage(playerid, VK_GREY, "Generate a one-time code in /cabinet and type /link 12345678.");
    return 1;
}

stock VarkenzaLocalMessage(playerid, Float:distance, color, const message[]) {
    new Float:x, Float:y, Float:z;
    GetPlayerPos(playerid, x, y, z);
    for (new i = 0; i < MAX_PLAYERS; i++) {
        if (!IsPlayerConnected(i)) continue;
        if (GetPlayerVirtualWorld(i) != GetPlayerVirtualWorld(playerid)) continue;
        if (GetPlayerInterior(i) != GetPlayerInterior(playerid)) continue;
        if (GetPlayerDistanceFromPoint(i, x, y, z) <= distance) SendClientMessage(i, color, message);
    }
    return 1;
}

stock VarkenzaPlayerAction(playerid, const command[], const text[], color) {
    if (strlen(text) < 1) {
        SendClientMessage(playerid, VK_RED, "Usage: /me, /do, /b or /try followed by text.");
        return 1;
    }
    new name[MAX_PLAYER_NAME], line[256];
    GetPlayerName(playerid, name, sizeof(name));
    if (!strcmp(command, "me")) format(line, sizeof(line), "* %s %s", name, text);
    else if (!strcmp(command, "do")) format(line, sizeof(line), "* %s (( %s ))", text, name);
    else if (!strcmp(command, "b")) format(line, sizeof(line), "(( %s: %s ))", name, text);
    else format(line, sizeof(line), "* %s tries: %s - %s", name, text, random(2) ? "SUCCESS" : "FAIL");
    return VarkenzaLocalMessage(playerid, 25.0, color, line);
}
// Encode an ASCII report for HTTP application/x-www-form-urlencoded.
// Non-ASCII chat encodings vary among legacy SA-MP clients and are not accepted here yet.
stock VarkenzaEncodeReport(const source[], output[], size) {
    new used = 0;
    new hex[] = "0123456789ABCDEF";
    for (new i = 0, len = strlen(source); i < len; i++) {
        new code = source[i] & 0xFF;
        if (code < 32 || code > 126) return 0;
        if ((code >= 'A' && code <= 'Z') || (code >= 'a' && code <= 'z') || (code >= '0' && code <= '9') || code == '-' || code == '_' || code == '.' || code == '~') {
            if (used + 1 >= size) return 0;
            output[used++] = code;
        } else {
            if (used + 3 >= size) return 0;
            output[used++] = '%';
            output[used++] = hex[code >> 4];
            output[used++] = hex[code & 15];
        }
    }
    output[used] = 0;
    return 1;
}

public OnPlayerCommandText(playerid, cmdtext[]) {
    new line[256], arg[144];
    if (!strcmp(cmdtext, "/help", true)) {
        SendClientMessage(playerid, VK_ORANGE, "=== VARKENZA RolePlay Alpha ===");
        SendClientMessage(playerid, VK_WHITE, "/me /do /try /b - local roleplay actions (25m)");
        SendClientMessage(playerid, VK_WHITE, "/link CODE - link a character via your website cabinet");
        SendClientMessage(playerid, VK_WHITE, "/stats /job /work - persistent character economy");
        SendClientMessage(playerid, VK_WHITE, "/report TEXT /savepos - staff report / save last safe location");
        SendClientMessage(playerid, VK_WHITE, "/garage /car 1-3 /park - garage commands; /engine /lock /fuel /refuel /condition /repair");
        SendClientMessage(playerid, VK_WHITE, "/staff CODE /staffoff /a /goto /gethere /freeze /unfreeze /spec /specoff /veh /dv");
        SendClientMessage(playerid, VK_WHITE, "/bank /deposit AMOUNT /withdraw AMOUNT /gps bank - banking");
        SendClientMessage(playerid, VK_WHITE, "/pay ID AMOUNT - hand cash to a nearby player (within 6m)");
        return 1;
    }
    if (!strcmp(cmdtext, "/rules", true)) {
        SendClientMessage(playerid, VK_ORANGE, "Be respectful. No cheats, harassment, or disruptive roleplay.");
        SendClientMessage(playerid, VK_GREY, "Development-only server: rules and penalty system will expand.");
        return 1;
    }
    if (strfind(cmdtext, "/me ", true) == 0) {
        strmid(arg, cmdtext, 4, strlen(cmdtext), sizeof(arg));
        return VarkenzaPlayerAction(playerid, "me", arg, VK_PURPLE);
    }
    if (strfind(cmdtext, "/do ", true) == 0) {
        strmid(arg, cmdtext, 4, strlen(cmdtext), sizeof(arg));
        return VarkenzaPlayerAction(playerid, "do", arg, VK_PURPLE);
    }
    if (strfind(cmdtext, "/b ", true) == 0) {
        strmid(arg, cmdtext, 3, strlen(cmdtext), sizeof(arg));
        return VarkenzaPlayerAction(playerid, "b", arg, VK_GREY);
    }
    if (strfind(cmdtext, "/try ", true) == 0) {
        strmid(arg, cmdtext, 5, strlen(cmdtext), sizeof(arg));
        return VarkenzaPlayerAction(playerid, "try", arg, VK_PURPLE);
    }
    if (!strcmp(cmdtext, "/report", true)) {
        SendClientMessage(playerid, VK_WHITE, "Usage: /report description in English (10-100 characters).");
        return 1;
    }
    if (strfind(cmdtext, "/report ", true) == 0) {
        if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Use /link CODE first.");
        if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for the previous request.");
        strmid(arg, cmdtext, 8, strlen(cmdtext), sizeof(arg));
        if (strlen(arg) < 10 || strlen(arg) > 100) return SendClientMessage(playerid, VK_RED, "Report must be 10-100 characters.");
        new encoded[320], body[512], url[128];
        if (!VarkenzaEncodeReport(arg, encoded, sizeof(encoded))) return SendClientMessage(playerid, VK_RED, "Report currently supports English/ASCII characters only.");
        format(body, sizeof(body), "key=%s&sid=%s&message=%s", VK_BRIDGE_SECRET, PlayerSID[playerid], encoded);
        format(url, sizeof(url), "%s/api/game/report", VK_BRIDGE_URL);
        if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaReportReply")) PlayerAction[playerid] = VK_ACTION_REPORT;
        else SendClientMessage(playerid, VK_RED, "Game API unavailable.");
        return 1;
    }
    if (strfind(cmdtext, "/link ", true) == 0) {
        if (PlayerLinked[playerid]) return SendClientMessage(playerid, VK_GREY, "Already linked. Reconnect to change your character.");
        if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for the previous request.");
        strmid(arg, cmdtext, 6, strlen(cmdtext), sizeof(arg));
        if (strlen(arg) != 8) return SendClientMessage(playerid, VK_RED, "Usage: /link 12345678 (code from website cabinet).");
        for (new i = 0; i < 8; i++) if (arg[i] < '0' || arg[i] > '9') return SendClientMessage(playerid, VK_RED, "Code must contain 8 digits.");
        new nick[MAX_PLAYER_NAME], body[256];
        GetPlayerName(playerid, nick, sizeof(nick));
        format(body, sizeof(body), "key=%s&code=%s&name=%s", VK_BRIDGE_SECRET, arg, nick);
        new url[128]; format(url, sizeof(url), "%s/api/game/link", VK_BRIDGE_URL);
        if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaLinkReply")) {
            PlayerAction[playerid] = VK_ACTION_LINK;
            SendClientMessage(playerid, VK_GREY, "Checking code against website...");
        } else SendClientMessage(playerid, VK_RED, "HTTP request could not start. Check bridge configuration.");
        return 1;
    }
    if (!strcmp(cmdtext, "/garage", true)) return VarkenzaGarageRequest(playerid, "LIST", 0);
    if (!strcmp(cmdtext, "/car", true)) return SendClientMessage(playerid, VK_GREY, "Usage: /car 1, /car 2, /car 3 (garage slot).");
    if (strfind(cmdtext, "/car ", true) == 0) {
        strmid(arg, cmdtext, 5, strlen(cmdtext), sizeof(arg));
        if (strlen(arg) != 1 || arg[0] < '1' || arg[0] > '3') return SendClientMessage(playerid, VK_RED, "Garage slot must be 1, 2 or 3.");
        if (PlayerGarageVehicle[playerid] != INVALID_VEHICLE_ID) return SendClientMessage(playerid, VK_RED, "Park your current vehicle first: /park.");
        return VarkenzaGarageRequest(playerid, "SPAWN", strval(arg));
    }
    if (!strcmp(cmdtext, "/park", true)) {
        if (PlayerGarageVehicle[playerid] == INVALID_VEHICLE_ID || GetPlayerState(playerid) != PLAYER_STATE_DRIVER || GetPlayerVehicleID(playerid) != PlayerGarageVehicle[playerid])
            return SendClientMessage(playerid, VK_RED, "You must be the driver of your personal vehicle to /park.");
        return VarkenzaGarageRequest(playerid, "PARK", 0);
    }
    if (!strcmp(cmdtext, "/engine", true)) {
        if (PlayerGarageVehicle[playerid] == INVALID_VEHICLE_ID || GetPlayerState(playerid) != PLAYER_STATE_DRIVER || GetPlayerVehicleID(playerid) != PlayerGarageVehicle[playerid])
            return SendClientMessage(playerid, VK_RED, "Drive your personal car to use /engine.");
        return VarkenzaCarRequest(playerid, "ENGINE", !PlayerCarEngine[playerid]);
    }
    if (!strcmp(cmdtext, "/lock", true)) {
        if (PlayerGarageVehicle[playerid] == INVALID_VEHICLE_ID) return SendClientMessage(playerid, VK_RED, "Get your personal car from the garage first.");
        new Float:vx, Float:vy, Float:vz;
        GetVehiclePos(PlayerGarageVehicle[playerid], vx, vy, vz);
        if (!IsPlayerInRangeOfPoint(playerid, 8.0, vx, vy, vz))
            return SendClientMessage(playerid, VK_RED, "Get closer to your car (8 metres).");
        return VarkenzaCarRequest(playerid, "LOCK", 0);
    }
    if (!strcmp(cmdtext, "/fuel", true) || !strcmp(cmdtext, "/condition", true)) return VarkenzaCarRequest(playerid, "STATUS", 0);
    if (!strcmp(cmdtext, "/repair", true)) {
        if (PlayerGarageVehicle[playerid] == INVALID_VEHICLE_ID || GetPlayerState(playerid) != PLAYER_STATE_DRIVER || GetPlayerVehicleID(playerid) != PlayerGarageVehicle[playerid])
            return SendClientMessage(playerid, VK_RED, "Repair from the driver's seat of your personal car.");
        if (PlayerCarEngine[playerid]) return SendClientMessage(playerid, VK_RED, "Switch the engine off before repair.");
        if (!IsPlayerInRangeOfPoint(playerid, 20.0, 1024.7, -1024.9, 32.1) || GetPlayerInterior(playerid) != 0 || GetPlayerVirtualWorld(playerid) != 0)
            return SendClientMessage(playerid, VK_RED, "Go to the Los Santos repair station: /gps repair.");
        return VarkenzaCarRequest(playerid, "REPAIR", 0);
    }
    if (!strcmp(cmdtext, "/refuel", true)) {
        if (PlayerGarageVehicle[playerid] == INVALID_VEHICLE_ID || GetPlayerState(playerid) != PLAYER_STATE_DRIVER || GetPlayerVehicleID(playerid) != PlayerGarageVehicle[playerid])
            return SendClientMessage(playerid, VK_RED, "Refuel from the driver's seat of your personal car.");
        if (PlayerCarEngine[playerid]) return SendClientMessage(playerid, VK_RED, "Switch the engine off before refuelling.");
        if (!IsPlayerInRangeOfPoint(playerid, 18.0, 1004.0, -937.0, 42.2) || GetPlayerInterior(playerid) != 0 || GetPlayerVirtualWorld(playerid) != 0)
            return SendClientMessage(playerid, VK_RED, "Go to the LS fuel station: /gps fuel.");
        return VarkenzaCarRequest(playerid, "REFUEL", 0);
    }
    if (!strcmp(cmdtext, "/bank", true)) return VarkenzaBankRequest(playerid, "BALANCE", 0);
    if (!strcmp(cmdtext, "/deposit", true) || !strcmp(cmdtext, "/withdraw", true)) {
        SendClientMessage(playerid, VK_GREY, "Usage: /deposit 100 or /withdraw 100 near /gps bank.");return 1;
    }
    if (strfind(cmdtext, "/deposit ", true) == 0 || strfind(cmdtext, "/withdraw ", true) == 0) {
        new bool:deposit = strfind(cmdtext, "/deposit ", true) == 0;
        strmid(arg, cmdtext, deposit ? 9 : 10, strlen(cmdtext), sizeof(arg));
        if (!strlen(arg) || strlen(arg) > 7 || arg[0] == '0') return SendClientMessage(playerid,VK_RED,"Amount: $1-$1000000 (digits only).");
        for (new i = 0; i < strlen(arg); i++) if (arg[i] < '0' || arg[i] > '9') return SendClientMessage(playerid,VK_RED,"Amount must be digits only.");
        new amount = strval(arg);
        if (amount < 1 || amount > 1000000) return SendClientMessage(playerid,VK_RED,"Amount: $1-$1000000.");
        if (GetPlayerState(playerid) != PLAYER_STATE_ONFOOT || GetPlayerInterior(playerid) != 0 || GetPlayerVirtualWorld(playerid) != 0 ||
            !IsPlayerInRangeOfPoint(playerid, 18.0, 1478.9225, -1010.1420, 26.8438))
            return SendClientMessage(playerid,VK_RED,"Walk to the bank: /gps bank.");
        return VarkenzaBankRequest(playerid,deposit ? "DEPOSIT" : "WITHDRAW",amount);
    }
    if (!strcmp(cmdtext, "/pay", true)) return SendClientMessage(playerid, VK_GREY, "Usage: /pay PLAYER_ID AMOUNT (within 6m, max $100000).");
    if (strfind(cmdtext, "/pay ", true) == 0) {
        if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Link your character first.");
        if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for the previous request.");
        new first[12], second[12], pos = 5, a = 0, b = 0;
        while (cmdtext[pos] == ' ') pos++;
        while (cmdtext[pos] >= '0' && cmdtext[pos] <= '9' && a < sizeof(first) - 1) first[a++] = cmdtext[pos++];
        first[a] = 0;
        if (cmdtext[pos] != ' ' || !a) return SendClientMessage(playerid, VK_RED, "Usage: /pay ID AMOUNT.");
        while (cmdtext[pos] == ' ') pos++;
        while (cmdtext[pos] >= '0' && cmdtext[pos] <= '9' && b < sizeof(second) - 1) second[b++] = cmdtext[pos++];
        second[b] = 0;
        if (!b || cmdtext[pos] != 0) return SendClientMessage(playerid, VK_RED, "Usage: /pay ID AMOUNT (digits only).");
        new target = strval(first), amount = strval(second);
        if (target < 0 || target >= MAX_PLAYERS || !IsPlayerConnected(target) || target == playerid || !PlayerLinked[target])
            return SendClientMessage(playerid, VK_RED, "Target must be another linked online player.");
        if (amount < 1 || amount > 100000) return SendClientMessage(playerid, VK_RED, "Amount must be $1-$100000.");
        if (GetPlayerInterior(playerid) != GetPlayerInterior(target) || GetPlayerVirtualWorld(playerid) != GetPlayerVirtualWorld(target))
            return SendClientMessage(playerid, VK_RED, "Target is in another world.");
        new Float:x, Float:y, Float:z;
        GetPlayerPos(target, x, y, z);
        if (!IsPlayerInRangeOfPoint(playerid, 6.0, x, y, z))
            return SendClientMessage(playerid, VK_RED, "Move closer to the recipient (6m).");
        new body[256], url[128];
        format(body, sizeof(body), "key=%s&sid=%s&target=%s&amount=%d", VK_BRIDGE_SECRET, PlayerSID[playerid], PlayerSID[target], amount);
        format(url, sizeof(url), "%s/api/game/pay", VK_BRIDGE_URL);
        PlayerPayTarget[playerid] = target;
        PlayerPayTargetEpoch[playerid] = PlayerEpoch[target];
        format(PlayerPayTargetSID[playerid], 49, "%s", PlayerSID[target]);
        if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaPayReply")) PlayerAction[playerid] = VK_ACTION_PAY;
        else SendClientMessage(playerid, VK_RED, "Payment service unavailable.");
        return 1;
    }
    if (!strcmp(cmdtext, "/savepos", true)) {
        return VarkenzaSavePosition(playerid, true);
    }
    if (!strcmp(cmdtext, "/staffoff", true)) {
        if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Use /link first.");
        if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for previous request.");
        new body[256], url[128];
        format(body, sizeof(body), "key=%s&sid=%s", VK_BRIDGE_SECRET, PlayerSID[playerid]);
        format(url, sizeof(url), "%s/api/game/staff-off", VK_BRIDGE_URL);
        if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaStaffOffReply")) PlayerAction[playerid] = VK_ACTION_STAFF_OFF;
        else SendClientMessage(playerid, VK_RED, "Game API unavailable.");
        return 1;
    }
    if (strfind(cmdtext, "/staff ", true) == 0) {
        if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Link character first.");
        if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for previous request.");
        strmid(arg, cmdtext, 7, strlen(cmdtext), sizeof(arg));
        if (strlen(arg) != 8) return SendClientMessage(playerid, VK_RED, "Usage: /staff 12345678 (from /admin). ");
        for (new i = 0; i < 8; i++) if (arg[i] < '0' || arg[i] > '9') return SendClientMessage(playerid, VK_RED, "Staff code must be 8 digits.");
        new body[256], url[128];
        format(body, sizeof(body), "key=%s&sid=%s&code=%s", VK_BRIDGE_SECRET, PlayerSID[playerid], arg);
        format(url, sizeof(url), "%s/api/game/staff-link", VK_BRIDGE_URL);
        if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaStaffLinkReply")) PlayerAction[playerid] = VK_ACTION_STAFF_LINK;
        else SendClientMessage(playerid, VK_RED, "Game API unavailable.");
        return 1;
    }
    if (!strcmp(cmdtext, "/a", true) || !strcmp(cmdtext, "/goto", true) || !strcmp(cmdtext, "/gethere", true)
      || !strcmp(cmdtext, "/freeze", true) || !strcmp(cmdtext, "/unfreeze", true)
      || !strcmp(cmdtext, "/spec", true) || !strcmp(cmdtext, "/veh", true)) {
        SendClientMessage(playerid, VK_GREY, "Usage: /a text, /goto ID, /gethere ID, /freeze ID, /unfreeze ID, /spec ID, /specoff, /veh 400-611");
        return 1;
    }
    if (!strcmp(cmdtext, "/dv", true)) {
        if (!PlayerStaff[playerid]) return SendClientMessage(playerid, VK_RED, "Staff session required.");
        if (PlayerStaffVehicle[playerid] != INVALID_VEHICLE_ID) {
            DestroyVehicle(PlayerStaffVehicle[playerid]);
            PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;
            SendClientMessage(playerid, VK_GREEN, "Temporary vehicle removed.");
        }
        return 1;
    }
    if (!strcmp(cmdtext, "/specoff", true)) return VarkenzaStopSpectating(playerid);
    if (strfind(cmdtext, "/a ", true) == 0) {
        strmid(arg, cmdtext, 3, strlen(cmdtext), sizeof(arg));
        return VarkenzaStaffRequest(playerid, VK_STAFF_CHAT, -1, 0, arg);
    }
    if (strfind(cmdtext, "/goto ", true) == 0 || strfind(cmdtext, "/gethere ", true) == 0 ||
        strfind(cmdtext, "/freeze ", true) == 0 || strfind(cmdtext, "/unfreeze ", true) == 0 || strfind(cmdtext, "/spec ", true) == 0 ||
        strfind(cmdtext, "/veh ", true) == 0) {
        new type, offset;
        if (strfind(cmdtext, "/goto ", true) == 0) { type = VK_STAFF_GOTO; offset = 6; }
        else if (strfind(cmdtext, "/gethere ", true) == 0) { type = VK_STAFF_GETHERE; offset = 9; }
        else if (strfind(cmdtext, "/freeze ", true) == 0) { type = VK_STAFF_FREEZE; offset = 8; }
        else if (strfind(cmdtext, "/unfreeze ", true) == 0) { type = VK_STAFF_UNFREEZE; offset = 10; }
        else if (strfind(cmdtext, "/spec ", true) == 0) { type = VK_STAFF_SPEC; offset = 6; }
        else { type = VK_STAFF_VEH; offset = 5; }
        strmid(arg, cmdtext, offset, strlen(cmdtext), sizeof(arg));
        if (!strlen(arg)) return SendClientMessage(playerid, VK_RED, "Numeric ID required.");
        for (new i = 0; i < strlen(arg); i++) if (arg[i] < '0' || arg[i] > '9') return SendClientMessage(playerid, VK_RED, "Numeric ID only.");
        new target = strval(arg);
        return VarkenzaStaffRequest(playerid, type, type == VK_STAFF_VEH ? -1 : target, type == VK_STAFF_VEH ? target : 0, "");
    }
    if (!strcmp(cmdtext, "/stats", true)) {
        if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Not linked. Use /link CODE.");
        new name[MAX_PLAYER_NAME];
        GetPlayerName(playerid, name, sizeof(name));
        format(line, sizeof(line), "Name: %s | Level: %d | Cash: $%d | Bank: $%d | Job: %d", name, PlayerLevel[playerid], PlayerCash[playerid], PlayerBank[playerid], PlayerJob[playerid]);
        SendClientMessage(playerid, VK_ORANGE, line);
        SendClientMessage(playerid, VK_GREY, "Balance and job are stored on website. /work pays via server API.");
        return 1;
    }
    if (!strcmp(cmdtext, "/job", true)) {
        SendClientMessage(playerid, VK_WHITE, "Choose /job courier, /job mechanic or /job taxi.");
        return 1;
    }
    if (strfind(cmdtext, "/job ", true) == 0) {
        if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Use /link CODE first.");
        if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for the previous request.");
        new job;
        if (!strcmp(cmdtext, "/job courier", true)) job = VK_JOB_COURIER;
        else if (!strcmp(cmdtext, "/job mechanic", true)) job = VK_JOB_MECHANIC;
        else if (!strcmp(cmdtext, "/job taxi", true)) job = VK_JOB_TAXI;
        else return SendClientMessage(playerid, VK_RED, "Unknown job. Type /job.");
        new body[256];
        format(body, sizeof(body), "key=%s&sid=%s&job=%d", VK_BRIDGE_SECRET, PlayerSID[playerid], job);
        new url[128]; format(url, sizeof(url), "%s/api/game/job", VK_BRIDGE_URL);
        if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaJobReply")) PlayerAction[playerid] = VK_ACTION_JOB;
        else SendClientMessage(playerid, VK_RED, "Game API unavailable.");
        return 1;
    }
    if (!strcmp(cmdtext, "/work", true)) {
        if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Use /link CODE first.");
        if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for the previous request.");
        if (PlayerJob[playerid] == VK_JOB_NONE) return SendClientMessage(playerid, VK_RED, "Choose a job first: /job");
        new body[256];
        format(body, sizeof(body), "key=%s&sid=%s", VK_BRIDGE_SECRET, PlayerSID[playerid]);
        new url[128]; format(url, sizeof(url), "%s/api/game/work", VK_BRIDGE_URL);
        if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaWorkReply")) PlayerAction[playerid] = VK_ACTION_WORK;
        else SendClientMessage(playerid, VK_RED, "Game API unavailable.");
        return 1;
    }
    if (!strcmp(cmdtext, "/gps", true)) {
        SendClientMessage(playerid, VK_WHITE, "Navigation: /gps cityhall, hospital, bank, garage, fuel, repair; /cancelgps.");
        return 1;
    }
    if (!strcmp(cmdtext, "/gps cityhall", true)) SetPlayerCheckpoint(playerid, 1481.0164, -1737.8495, 13.5469, 4.0);
    else if (!strcmp(cmdtext, "/gps hospital", true)) SetPlayerCheckpoint(playerid, 1178.9961, -1323.5588, 14.1262, 4.0);
    else if (!strcmp(cmdtext, "/gps bank", true)) SetPlayerCheckpoint(playerid, 1478.9225, -1010.1420, 26.8438, 4.0);
    else if (!strcmp(cmdtext, "/gps garage", true)) SetPlayerCheckpoint(playerid, 1548.9, -1679.2, 13.15, 4.0);
    else if (!strcmp(cmdtext, "/gps fuel", true)) SetPlayerCheckpoint(playerid, 1004.0, -937.0, 42.2, 6.0);
    else if (!strcmp(cmdtext, "/gps repair", true)) SetPlayerCheckpoint(playerid, 1024.7, -1024.9, 32.1, 6.0);
    else if (strfind(cmdtext, "/gps ", true) == 0) {
        SendClientMessage(playerid, VK_RED, "Unknown destination. Type /gps.");
        return 1;
    }
    if (strfind(cmdtext, "/gps ", true) == 0) {
        SendClientMessage(playerid, VK_GREEN, "Route marked on the map (development waypoint).");
        return 1;
    }
    if (!strcmp(cmdtext, "/cancelgps", true)) {
        DisablePlayerCheckpoint(playerid);
        SendClientMessage(playerid, VK_GREY, "Waypoint removed.");
        return 1;
    }
    if (!strcmp(cmdtext, "/time", true)) {
        new hour, minute;
        GetPlayerTime(playerid, hour, minute);
        format(line, sizeof(line), "World time: %02d:%02d", hour, minute);
        SendClientMessage(playerid, VK_WHITE, line);
        return 1;
    }
    SendClientMessage(playerid, VK_RED, "Unknown command. Use /help.");
    return 1;
}

public OnPlayerDisconnect(playerid, reason) {
    new Float:exitHealth = 1000.0;
    new bool:hasCar = PlayerGarageVehicle[playerid] != INVALID_VEHICLE_ID;
    if (hasCar) {
        GetVehicleHealth(PlayerGarageVehicle[playerid], exitHealth);
        if (exitHealth < 250.0) exitHealth = 250.0;
        if (exitHealth > 1000.0) exitHealth = 1000.0;
    }
    if (PlayerStaffVehicle[playerid] != INVALID_VEHICLE_ID) DestroyVehicle(PlayerStaffVehicle[playerid]);
    if (PlayerGarageVehicle[playerid] != INVALID_VEHICLE_ID) DestroyVehicle(PlayerGarageVehicle[playerid]);
    PlayerGarageVehicle[playerid] = INVALID_VEHICLE_ID;
    PlayerCarEngine[playerid] = false;
    PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;
    PlayerStaff[playerid] = false;
    PlayerJob[playerid] = VK_JOB_NONE;
    PlayerLinked[playerid] = false;
    PlayerAction[playerid] = VK_ACTION_NONE;
    PlayerPendingIndex[playerid] = -1;
    PlayerEpoch[playerid]++;
    if (PlayerSID[playerid][0]) {
        new body[256];
        if (hasCar) format(body, sizeof(body), "key=%s&sid=%s&health=%d", VK_BRIDGE_SECRET, PlayerSID[playerid], floatround(exitHealth));
        else format(body, sizeof(body), "key=%s&sid=%s", VK_BRIDGE_SECRET, PlayerSID[playerid]);
        new url[128]; format(url, sizeof(url), "%s/api/game/logout", VK_BRIDGE_URL);
        HTTP(0, HTTP_POST, url, body, "VarkenzaIgnored");
    }
    PlayerSID[playerid][0] = 0;
    return 1;
}

public OnPlayerSpawn(playerid) {
    if (PlayerReturnSpec[playerid]) {
        PlayerReturnSpec[playerid] = false;
        SetPlayerInterior(playerid, PlayerReturnInterior[playerid]);
        SetPlayerVirtualWorld(playerid, PlayerReturnWorld[playerid]);
        SetPlayerPos(playerid, PlayerReturnX[playerid], PlayerReturnY[playerid], PlayerReturnZ[playerid]);
        return 1;
    }
    if (PlayerLinked[playerid]) {
        if (PlayerRestorePosition[playerid]) {
            PlayerRestorePosition[playerid] = false;
            SetPlayerInterior(playerid, PlayerSavedInterior[playerid]);
            SetPlayerVirtualWorld(playerid, PlayerSavedWorld[playerid]);
            SetPlayerPos(playerid, PlayerSavedX[playerid], PlayerSavedY[playerid], PlayerSavedZ[playerid]);
            SetPlayerFacingAngle(playerid, PlayerSavedA[playerid]);
        }
        SetPlayerSkin(playerid, PlayerSkin[playerid]);
        ResetPlayerMoney(playerid);
        GivePlayerMoney(playerid, PlayerCash[playerid]);
    }
    return 1;
}

// Prevent taking the wheel of another player's private vehicle.
// Passenger seats remain available; locked doors are enforced by GTA vehicle parameters.
public OnPlayerStateChange(playerid, newstate, oldstate) {
    if (newstate != PLAYER_STATE_DRIVER) return 1;
    new vehicleid = GetPlayerVehicleID(playerid);
    for (new i = 0; i < MAX_PLAYERS; i++) {
        if (i == playerid || !IsPlayerConnected(i)) continue;
        if (PlayerGarageVehicle[i] == vehicleid) {
            RemovePlayerFromVehicle(playerid);
            SendClientMessage(playerid, VK_RED, "You cannot drive someone else's personal car.");
            return 1;
        }
    }
    return 1;
}

stock VarkenzaEpochIndex(playerid) {
    return playerid + MAX_PLAYERS * (PlayerEpoch[playerid] % 1000000);
}
stock VarkenzaRequestIndex(playerid) {
    // Every HTTP request gets its own monotonic token. Late responses cannot
    // satisfy a later request of the same action, even after a timeout.
    PlayerRequestSeq[playerid] = (PlayerRequestSeq[playerid] + 1) % 1000000;
    PlayerPendingIndex[playerid] = playerid + MAX_PLAYERS * PlayerRequestSeq[playerid];
    PlayerPendingSince[playerid] = GetTickCount();
    return PlayerPendingIndex[playerid];
}
stock VarkenzaValidReply(index, action) {
    new playerid = index % MAX_PLAYERS;
    if (!IsPlayerConnected(playerid) || PlayerPendingIndex[playerid] != index) return -1;
    if (PlayerAction[playerid] != action) return -1;
    PlayerAction[playerid] = VK_ACTION_NONE;
    PlayerPendingIndex[playerid] = -1;
    return playerid;
}
public VarkenzaCheckRequests() {
    for (new i = 0; i < MAX_PLAYERS; i++) {
        if (!IsPlayerConnected(i) || PlayerAction[i] == VK_ACTION_NONE) continue;
        if (GetTickCount() - PlayerPendingSince[i] < VK_REQUEST_TIMEOUT_MS) continue;
        PlayerAction[i] = VK_ACTION_NONE;
        PlayerPendingIndex[i] = -1;
        SendClientMessage(i, VK_RED, "Website request timed out. Check /stats before retrying money operations.");
    }
    return 1;
}
stock VarkenzaField(const data[], field, out[], size) {
    new start = 0, current = 0, len = strlen(data);
    for (new i = 0; i <= len; i++) {
        if (i == len || data[i] == '|') {
            if (current == field) {
                strmid(out, data, start, i, size);
                return 1;
            }
            start = i + 1;
            current++;
        }
    }
    out[0] = 0;
    return 0;
}
// Release all temporary privileges and resources when staff authorization ends.
stock VarkenzaRevokeStaff(playerid) {
    PlayerStaff[playerid] = false;
    if (PlayerSpectating[playerid]) VarkenzaStopSpectating(playerid);
    new vehicleid = PlayerStaffVehicle[playerid];
    PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;
    if (vehicleid != INVALID_VEHICLE_ID) DestroyVehicle(vehicleid);
    return 1;
}
stock VarkenzaLostSession(playerid) {
    VarkenzaRevokeStaff(playerid);
    new garageVehicle = PlayerGarageVehicle[playerid];
    PlayerGarageVehicle[playerid] = INVALID_VEHICLE_ID;
    if (garageVehicle != INVALID_VEHICLE_ID) DestroyVehicle(garageVehicle);
    PlayerCarEngine[playerid] = false;
    PlayerLinked[playerid] = false;
    PlayerSID[playerid][0] = 0;
    PlayerPendingIndex[playerid] = -1;
    PlayerAction[playerid] = VK_ACTION_NONE;
    PlayerJob[playerid] = VK_JOB_NONE;
    SendClientMessage(playerid, VK_RED, "Game session expired or access revoked. Generate a new code in /cabinet.");
    return 1;
}
public VarkenzaLinkReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_LINK);
    if (playerid < 0) return 1;
    if (response_code != 200) {
        SendClientMessage(playerid, VK_RED, "Link failed. Check code, nickname, website and bridge secret.");
        return 1;
    }
    new status[8], sid[49], name[MAX_PLAYER_NAME], field[32], actual[MAX_PLAYER_NAME];
    VarkenzaField(data, 0, status, sizeof(status));
    VarkenzaField(data, 1, sid, sizeof(sid));
    VarkenzaField(data, 2, name, sizeof(name));
    GetPlayerName(playerid, actual, sizeof(actual));
    if (strcmp(status, "OK") || strlen(sid) != 48 || strcmp(name, actual, true)) {
        SendClientMessage(playerid, VK_RED, "Invalid bridge response or character mismatch.");
        return 1;
    }
    format(PlayerSID[playerid], 49, "%s", sid);
    VarkenzaField(data, 3, field, sizeof(field)); PlayerSkin[playerid] = strval(field);
    VarkenzaField(data, 4, field, sizeof(field)); PlayerCash[playerid] = strval(field);
    VarkenzaField(data, 5, field, sizeof(field)); PlayerJob[playerid] = strval(field);
    VarkenzaField(data, 6, field, sizeof(field)); PlayerLevel[playerid] = strval(field);
    PlayerLinked[playerid] = true;
    // v0.6: saved position is a spawn hint, not authoritative movement.
    new posField[40];
    if (VarkenzaField(data, 7, posField, sizeof(posField)) && strlen(posField)) {
        PlayerSavedX[playerid] = floatstr(posField);
        VarkenzaField(data, 8, posField, sizeof(posField)); PlayerSavedY[playerid] = floatstr(posField);
        VarkenzaField(data, 9, posField, sizeof(posField)); PlayerSavedZ[playerid] = floatstr(posField);
        VarkenzaField(data, 10, posField, sizeof(posField)); PlayerSavedA[playerid] = floatstr(posField);
        VarkenzaField(data, 11, posField, sizeof(posField)); PlayerSavedInterior[playerid] = strval(posField);
        VarkenzaField(data, 12, posField, sizeof(posField)); PlayerSavedWorld[playerid] = strval(posField);
        PlayerRestorePosition[playerid] = true;
        if (GetPlayerState(playerid) == PLAYER_STATE_ONFOOT) {
            PlayerRestorePosition[playerid] = false;
            SetPlayerInterior(playerid, PlayerSavedInterior[playerid]);
            SetPlayerVirtualWorld(playerid, PlayerSavedWorld[playerid]);
            SetPlayerPos(playerid, PlayerSavedX[playerid], PlayerSavedY[playerid], PlayerSavedZ[playerid]);
            SetPlayerFacingAngle(playerid, PlayerSavedA[playerid]);
        }
    }
    SetPlayerSkin(playerid, PlayerSkin[playerid]);
    ResetPlayerMoney(playerid);
    GivePlayerMoney(playerid, PlayerCash[playerid]);
    SendClientMessage(playerid, VK_GREEN, "Character linked. Cash, job and level loaded from website.");
    return 1;
}
public VarkenzaJobReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_JOB);
    if (playerid < 0) return 1;
    if (response_code != 200) {
        if (response_code == 401 || response_code == 403) VarkenzaLostSession(playerid);
        else SendClientMessage(playerid, VK_RED, "Job change failed. Check website connection.");
        return 1;
    }
    new field[32]; VarkenzaField(data, 1, field, sizeof(field));
    PlayerJob[playerid] = strval(field);
    SendClientMessage(playerid, VK_GREEN, "Job saved! Use /work to earn money.");
    return 1;
}
public VarkenzaWorkReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_WORK);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) return VarkenzaLostSession(playerid);
    new text[128], field[32];
    if (response_code == 429) {
        VarkenzaField(data, 2, field, sizeof(field));
        format(text, sizeof(text), "Rest for %d seconds before the next shift.", strval(field));
        SendClientMessage(playerid, VK_RED, text); return 1;
    }
    if (response_code != 200) return SendClientMessage(playerid, VK_RED, "Shift failed; no payment was issued.");
    VarkenzaField(data, 1, field, sizeof(field)); PlayerCash[playerid] = strval(field);
    VarkenzaField(data, 2, field, sizeof(field)); new earned = strval(field);
    VarkenzaField(data, 3, field, sizeof(field)); PlayerLevel[playerid] = strval(field);
    ResetPlayerMoney(playerid);
    GivePlayerMoney(playerid, PlayerCash[playerid]);
    format(text, sizeof(text), "Shift completed: +$%d. Saved total: $%d.", earned, PlayerCash[playerid]);
    SendClientMessage(playerid, VK_GREEN, text);
    return 1;
}
public VarkenzaPayReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_PAY);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) return VarkenzaLostSession(playerid);
    if (response_code != 200) return SendClientMessage(playerid, VK_RED, "Transfer denied (balance, cooldown or recipient offline).");
    new cashField[24], amountField[24], name[MAX_PLAYER_NAME], text[128];
    VarkenzaField(data, 2, cashField, sizeof(cashField)); PlayerCash[playerid] = strval(cashField);
    VarkenzaField(data, 3, name, sizeof(name));
    VarkenzaField(data, 4, amountField, sizeof(amountField));
    ResetPlayerMoney(playerid); GivePlayerMoney(playerid, PlayerCash[playerid]);
    format(text, sizeof(text), "You handed $%d to %s. Balance: $%d", strval(amountField), name, PlayerCash[playerid]);
    SendClientMessage(playerid, VK_GREEN, text);
    new target = PlayerPayTarget[playerid];
    if (target >= 0 && target < MAX_PLAYERS && IsPlayerConnected(target) &&
        PlayerEpoch[target] == PlayerPayTargetEpoch[playerid] && !strcmp(PlayerSID[target], PlayerPayTargetSID[playerid])) {
        format(text, sizeof(text), "You received $%d. Your balance will sync shortly.", strval(amountField));
        SendClientMessage(target, VK_GREEN, text);
    }
    return 1;
}
public VarkenzaReportReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_REPORT);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) return VarkenzaLostSession(playerid);
    if (response_code == 429) return SendClientMessage(playerid, VK_RED, "Report limit reached. Wait or close existing reports.");
    if (response_code != 200) return SendClientMessage(playerid, VK_RED, "Report not accepted. Try again later.");
    SendClientMessage(playerid, VK_GREEN, "Report submitted. Check /cabinet for staff response.");
    return 1;
}
public VarkenzaPingReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_PING);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) return VarkenzaLostSession(playerid);
    if (response_code != 200) return 1;
    new field[32];
    VarkenzaField(data, 1, field, sizeof(field)); PlayerCash[playerid] = strval(field);
    VarkenzaField(data, 2, field, sizeof(field)); PlayerJob[playerid] = strval(field);
    ResetPlayerMoney(playerid);
    GivePlayerMoney(playerid, PlayerCash[playerid]);
    new commandId[20], commandType[16], commandText[100];
    VarkenzaField(data, 3, commandId, sizeof(commandId));
    if (!strcmp(commandId, "STAFF_OFF")) VarkenzaRevokeStaff(playerid);
    if (!strcmp(commandId, "STAFF_ON")) PlayerStaff[playerid] = true;
    if (strlen(commandId) == 16) {
        VarkenzaField(data, 4, commandType, sizeof(commandType));
        VarkenzaField(data, 5, commandText, sizeof(commandText));
        if (!strcmp(commandType, "WARN") || !strcmp(commandType, "KICK")) {
            new msg[144], body[256], url[128];
            format(msg, sizeof(msg), "[STAFF %s]: %s", commandType, commandText);
            SendClientMessage(playerid, VK_RED, msg);
            format(body, sizeof(body), "key=%s&sid=%s&command=%s", VK_BRIDGE_SECRET, PlayerSID[playerid], commandId);
            format(url, sizeof(url), "%s/api/game/ack", VK_BRIDGE_URL);
            if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaAckReply")) {
                PlayerAction[playerid] = VK_ACTION_ACK;
            }
            // Kick is not just a website token revocation: disconnect the actual SA-MP player.
            if (!strcmp(commandType, "KICK")) {
                SetTimerEx("VarkenzaDelayedKick", 800, false, "i", VarkenzaEpochIndex(playerid));
            }
        }
    }
    if (PlayerAction[playerid] == VK_ACTION_NONE && PlayerCarEngine[playerid] &&
        PlayerGarageVehicle[playerid] != INVALID_VEHICLE_ID && GetPlayerState(playerid) == PLAYER_STATE_DRIVER &&
        GetPlayerVehicleID(playerid) == PlayerGarageVehicle[playerid]) {
        VarkenzaCarRequest(playerid, "DRIVE", 0);
    }
    if (PlayerAction[playerid] == VK_ACTION_NONE && !PlayerSpectating[playerid]) VarkenzaSavePosition(playerid, false);
    return 1;
}
public VarkenzaAckReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_ACK);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) VarkenzaLostSession(playerid);
    return 1;
}
public VarkenzaDelayedKick(index) {
    new playerid = index % MAX_PLAYERS;
    if (IsPlayerConnected(playerid) && PlayerEpoch[playerid] % 1000000 == index / MAX_PLAYERS) Kick(playerid);
    return 1;
}
public VarkenzaHeartbeat() {
    for (new i = 0; i < MAX_PLAYERS; i++) {
        if (!IsPlayerConnected(i) || !PlayerLinked[i] || PlayerAction[i] != VK_ACTION_NONE) continue;
        new body[256];
        format(body, sizeof(body), "key=%s&sid=%s", VK_BRIDGE_SECRET, PlayerSID[i]);
        new url[128]; format(url, sizeof(url), "%s/api/game/ping", VK_BRIDGE_URL);
        if (HTTP(VarkenzaRequestIndex(i), HTTP_POST, url, body, "VarkenzaPingReply")) PlayerAction[i] = VK_ACTION_PING;
    }
    return 1;
}
public VarkenzaIgnored(index, response_code, data[]) { return 1; }

stock VarkenzaApplyCarParams(playerid) {
    if (PlayerGarageVehicle[playerid] == INVALID_VEHICLE_ID) return 0;
    SetVehicleParamsEx(PlayerGarageVehicle[playerid], PlayerCarEngine[playerid] ? 1 : 0,
        0, 0, PlayerCarLocked[playerid] ? 1 : 0, 0, 0, 0);
    return 1;
}
stock VarkenzaCarRequest(playerid, const action[], value) {
    if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Link your character first: /link CODE.");
    if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for previous request.");
    if (PlayerGarageVehicle[playerid] == INVALID_VEHICLE_ID) return SendClientMessage(playerid, VK_RED, "Spawn your private car with /car SLOT first.");
    new body[440], url[128];
    new Float:x, Float:y, Float:z, Float:health = 1000.0;
    GetPlayerPos(playerid, x, y, z);
    GetVehicleHealth(PlayerGarageVehicle[playerid], health);
    if (health < 250.0) health = 250.0;
    if (health > 1000.0) health = 1000.0;
    format(body, sizeof(body), "key=%s&sid=%s&action=%s&value=%d&x=%f&y=%f&z=%f&interior=%d&world=%d&health=%d",
        VK_BRIDGE_SECRET, PlayerSID[playerid], action, value, x, y, z, GetPlayerInterior(playerid), GetPlayerVirtualWorld(playerid), floatround(health));
    format(url, sizeof(url), "%s/api/game/garage", VK_BRIDGE_URL);
    if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaCarStateReply")) {
        PlayerAction[playerid] = VK_ACTION_CAR_STATE;
        format(PlayerCarAction[playerid], 16, "%s", action);
    } else SendClientMessage(playerid, VK_RED, "Vehicle service unavailable.");
    return 1;
}
public VarkenzaCarStateReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_CAR_STATE);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) return VarkenzaLostSession(playerid);
    if (response_code != 200) return SendClientMessage(playerid, VK_RED, "Car request denied. Check engine, fuel, funds or petrol station.");
    new tag[24], field[36];
    VarkenzaField(data, 1, tag, sizeof(tag));
    if (strcmp(tag, "STATE")) return 1;
    VarkenzaField(data, 2, field, sizeof(field)); PlayerCarFuel[playerid] = strval(field);
    VarkenzaField(data, 3, field, sizeof(field)); PlayerCarCapacity[playerid] = strval(field);
    VarkenzaField(data, 4, field, sizeof(field)); PlayerCarHealth[playerid] = strval(field);
    VarkenzaField(data, 5, field, sizeof(field)); PlayerCarLocked[playerid] = strval(field) != 0;
    VarkenzaField(data, 6, field, sizeof(field)); PlayerCarEngine[playerid] = strval(field) != 0;
    VarkenzaApplyCarParams(playerid);
    if (!strcmp(PlayerCarAction[playerid], "DRIVE") && PlayerCarFuel[playerid] > 0) return 1;
    new msg[144];
    new engineText[8], lockText[10];
    if (PlayerCarEngine[playerid]) format(engineText, sizeof(engineText), "ON");
    else format(engineText, sizeof(engineText), "OFF");
    if (PlayerCarLocked[playerid]) format(lockText, sizeof(lockText), "LOCKED");
    else format(lockText, sizeof(lockText), "OPEN");
    format(msg, sizeof(msg), "Car: fuel %d/%d | condition %d/1000 | engine %s | doors %s",
        PlayerCarFuel[playerid], PlayerCarCapacity[playerid], PlayerCarHealth[playerid], engineText, lockText);
    SendClientMessage(playerid, VK_ORANGE, msg);
    if (!strcmp(PlayerCarAction[playerid], "REFUEL")) SendClientMessage(playerid, VK_GREEN, "Fuel tank filled. Payment deducted from character balance.");
    if (!strcmp(PlayerCarAction[playerid], "REPAIR")) {
        RepairVehicle(PlayerGarageVehicle[playerid]);
        SetVehicleHealth(PlayerGarageVehicle[playerid], float(PlayerCarHealth[playerid]));
        SendClientMessage(playerid, VK_GREEN, "Car repaired. Payment deducted from character balance.");
    }
    if (PlayerCarFuel[playerid] == 0) SendClientMessage(playerid, VK_RED, "Out of fuel. Go to /gps fuel.");
    return 1;
}

stock VarkenzaBankRequest(playerid, const action[], amount) {
    if (!PlayerLinked[playerid]) return SendClientMessage(playerid,VK_RED,"Use /link CODE first.");
    if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid,VK_RED,"Wait for the previous request.");
    new body[400], url[128];
    new Float:x, Float:y, Float:z;
    GetPlayerPos(playerid,x,y,z);
    format(body,sizeof(body),"key=%s&sid=%s&action=%s&amount=%d&x=%f&y=%f&z=%f&interior=%d&world=%d",
        VK_BRIDGE_SECRET,PlayerSID[playerid],action,amount,x,y,z,GetPlayerInterior(playerid),GetPlayerVirtualWorld(playerid));
    format(url,sizeof(url),"%s/api/game/bank",VK_BRIDGE_URL);
    if (HTTP(VarkenzaRequestIndex(playerid),HTTP_POST,url,body,"VarkenzaBankReply")) PlayerAction[playerid] = VK_ACTION_BANK;
    else SendClientMessage(playerid,VK_RED,"Bank service unavailable.");
    return 1;
}
public VarkenzaBankReply(index, response_code, data[]) {
    new playerid=VarkenzaValidReply(index,VK_ACTION_BANK);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) return VarkenzaLostSession(playerid);
    if (response_code != 200) return SendClientMessage(playerid,VK_RED,"Bank request denied: check amount, funds and location.");
    new field[32], tag[16], msg[120];
    VarkenzaField(data,1,tag,sizeof(tag));
    if (strcmp(tag,"BANK")) return 1;
    VarkenzaField(data,2,field,sizeof(field));PlayerCash[playerid]=strval(field);
    VarkenzaField(data,3,field,sizeof(field));PlayerBank[playerid]=strval(field);
    ResetPlayerMoney(playerid);GivePlayerMoney(playerid,PlayerCash[playerid]);
    format(msg,sizeof(msg),"Bank balance: $%d | Cash: $%d. All changes saved.",PlayerBank[playerid],PlayerCash[playerid]);
    SendClientMessage(playerid,VK_GREEN,msg);
    return 1;
}

// Garage is server-authoritative on Node.js. Pawn owns spawned GTA vehicle IDs only.
stock VarkenzaGarageRequest(playerid, const action[], slot) {
    if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Use /link CODE first.");
    if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for the previous request.");
    if (PlayerSpectating[playerid]) return SendClientMessage(playerid, VK_RED, "Exit spectate first.");
    new body[460], url[128];
    if (!strcmp(action, "PARK")) {
        new Float:x, Float:y, Float:z, Float:a, Float:health;
        if (PlayerCarEngine[playerid]) return SendClientMessage(playerid, VK_RED, "Switch the engine off before parking: /engine.");
        if (!GetVehiclePos(PlayerGarageVehicle[playerid], x, y, z)) return SendClientMessage(playerid, VK_RED, "Vehicle not found.");
        GetVehicleHealth(PlayerGarageVehicle[playerid], health);
        if (health < 250.0) health = 250.0;
        if (health > 1000.0) health = 1000.0;
        GetVehicleZAngle(PlayerGarageVehicle[playerid], a);
        format(body, sizeof(body), "key=%s&sid=%s&action=PARK&x=%f&y=%f&z=%f&a=%f&interior=%d&world=%d&health=%d",
          VK_BRIDGE_SECRET, PlayerSID[playerid], x, y, z, a, GetPlayerInterior(playerid), GetPlayerVirtualWorld(playerid), floatround(health));
    } else if (!strcmp(action, "SPAWN")) {
        format(body, sizeof(body), "key=%s&sid=%s&action=SPAWN&slot=%d", VK_BRIDGE_SECRET, PlayerSID[playerid], slot);
    } else format(body, sizeof(body), "key=%s&sid=%s&action=LIST", VK_BRIDGE_SECRET, PlayerSID[playerid]);
    format(url, sizeof(url), "%s/api/game/garage", VK_BRIDGE_URL);
    if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaGarageReply")) PlayerAction[playerid] = VK_ACTION_GARAGE;
    else SendClientMessage(playerid, VK_RED, "Garage service unavailable.");
    return 1;
}
public VarkenzaGarageReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_GARAGE);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) return VarkenzaLostSession(playerid);
    if (response_code != 200) return SendClientMessage(playerid, VK_RED, "Garage request denied: check slot, car status or API.");
    new tag[20], field[90];
    VarkenzaField(data, 1, tag, sizeof(tag));
    if (!strcmp(tag, "GARAGE")) {
        SendClientMessage(playerid, VK_ORANGE, "Your garage (slot / model / name):");
        for (new i = 2; i < 5; i++) {
            if (!VarkenzaField(data, i, field, sizeof(field)) || !strlen(field)) break;
            if (!strcmp(field, "EMPTY")) SendClientMessage(playerid, VK_GREY, "Empty. Purchase at /cabinet on the website.");
            else SendClientMessage(playerid, VK_WHITE, field);
        }
        return 1;
    }
    if (!strcmp(tag, "SPAWN")) {
        // Bridge fields: OK|SPAWN|slot|model|x|y|z|a|interior|world
        VarkenzaField(data, 3, field, sizeof(field)); new model = strval(field);
        if (model < 400 || model > 611 || PlayerGarageVehicle[playerid] != INVALID_VEHICLE_ID) return SendClientMessage(playerid, VK_RED, "Invalid garage vehicle model or duplicate vehicle.");
        new Float:x, Float:y, Float:z, Float:a, interior, world;
        VarkenzaField(data, 4, field, sizeof(field)); x = floatstr(field);
        VarkenzaField(data, 5, field, sizeof(field)); y = floatstr(field);
        VarkenzaField(data, 6, field, sizeof(field)); z = floatstr(field);
        VarkenzaField(data, 7, field, sizeof(field)); a = floatstr(field);
        VarkenzaField(data, 8, field, sizeof(field)); interior = strval(field);
        VarkenzaField(data, 9, field, sizeof(field)); world = strval(field);
        new vid = CreateVehicle(model, x, y, z, a, -1, -1, -1);
        if (vid == INVALID_VEHICLE_ID || vid == 0) {
            new body[256], url[128];
            format(body, sizeof(body), "key=%s&sid=%s&action=DESPAWN", VK_BRIDGE_SECRET, PlayerSID[playerid]);
            format(url, sizeof(url), "%s/api/game/garage", VK_BRIDGE_URL);
            HTTP(0, HTTP_POST, url, body, "VarkenzaIgnored");
            return SendClientMessage(playerid, VK_RED, "Failed to create personal vehicle.");
        }
        PlayerGarageVehicle[playerid] = vid;
        VarkenzaField(data, 10, field, sizeof(field)); PlayerCarFuel[playerid] = strval(field);
        VarkenzaField(data, 11, field, sizeof(field)); PlayerCarHealth[playerid] = strval(field);
        VarkenzaField(data, 12, field, sizeof(field)); PlayerCarLocked[playerid] = strval(field) != 0;
        PlayerCarEngine[playerid] = false;
        SetVehicleHealth(vid, float(PlayerCarHealth[playerid]));
        VarkenzaApplyCarParams(playerid);
        LinkVehicleToInterior(vid, interior);
        SetVehicleVirtualWorld(vid, world);
        SendClientMessage(playerid, VK_GREEN, "Personal vehicle spawned at its saved location. /park to save and store it.");
        SetPlayerCheckpoint(playerid, x, y, z, 4.0);
        return 1;
    }
    if (!strcmp(tag, "PARKED")) {
        if (PlayerGarageVehicle[playerid] != INVALID_VEHICLE_ID) {
            RemovePlayerFromVehicle(playerid);
            DestroyVehicle(PlayerGarageVehicle[playerid]);
            PlayerGarageVehicle[playerid] = INVALID_VEHICLE_ID;
            PlayerCarEngine[playerid] = false;
        }
        SendClientMessage(playerid, VK_GREEN, "Car parked. Location saved in SQLite.");
        return 1;
    }
    return 1;
}
// If a personal vehicle explodes it is no longer considered active in the bridge.
public OnVehicleDeath(vehicleid, killerid) {
    for (new i = 0; i < MAX_PLAYERS; i++) {
        if (!IsPlayerConnected(i)) continue;
        // Clear destroyed temporary admin vehicles before the server reuses
        // their vehicle IDs. Otherwise /dv or disconnect can destroy a new car.
        if (PlayerStaffVehicle[i] == vehicleid) {
            PlayerStaffVehicle[i] = INVALID_VEHICLE_ID;
        }
        if (PlayerGarageVehicle[i] != vehicleid) continue;
        PlayerGarageVehicle[i] = INVALID_VEHICLE_ID;
        PlayerCarEngine[i] = false;
        if (PlayerLinked[i]) {
            new body[256], url[128];
            format(body, sizeof(body), "key=%s&sid=%s&action=DESPAWN&health=250", VK_BRIDGE_SECRET, PlayerSID[i]);
            format(url, sizeof(url), "%s/api/game/garage", VK_BRIDGE_URL);
            HTTP(0, HTTP_POST, url, body, "VarkenzaIgnored");
        }
        SendClientMessage(i, VK_RED, "Your personal vehicle was destroyed. Use /car SLOT to respawn later.");
        break;
    }
    return 1;
}

// All staff privileges are verified by the Node bridge on EVERY action.
stock VarkenzaSavePosition(playerid, bool:manual) {
    if (!PlayerLinked[playerid]) return SendClientMessage(playerid, VK_RED, "Use /link CODE first.");
    if (PlayerAction[playerid] != VK_ACTION_NONE) return manual ? SendClientMessage(playerid, VK_RED, "Wait for previous request.") : 1;
    if (PlayerSpectating[playerid] || GetPlayerState(playerid) == PLAYER_STATE_SPECTATING) return manual ? SendClientMessage(playerid, VK_RED, "Stop spectating first.") : 1;
    if (GetPlayerState(playerid) != PLAYER_STATE_ONFOOT && GetPlayerState(playerid) != PLAYER_STATE_DRIVER && GetPlayerState(playerid) != PLAYER_STATE_PASSENGER) return 1;
    new Float:x, Float:y, Float:z, Float:angle;
    GetPlayerPos(playerid, x, y, z);
    if (GetPlayerState(playerid) == PLAYER_STATE_DRIVER || GetPlayerState(playerid) == PLAYER_STATE_PASSENGER) GetVehicleZAngle(GetPlayerVehicleID(playerid), angle);
    else GetPlayerFacingAngle(playerid, angle);
    new body[400], url[128];
    format(body, sizeof(body), "key=%s&sid=%s&x=%f&y=%f&z=%f&a=%f&interior=%d&world=%d",
        VK_BRIDGE_SECRET, PlayerSID[playerid], x, y, z, angle, GetPlayerInterior(playerid), GetPlayerVirtualWorld(playerid));
    format(url, sizeof(url), "%s/api/game/position", VK_BRIDGE_URL);
    if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaPositionReply")) {
        PlayerAction[playerid] = VK_ACTION_POSITION;
        PlayerManualSave[playerid] = manual;
    }
    else if (manual) SendClientMessage(playerid, VK_RED, "Position save service unavailable.");
    return 1;
}
public VarkenzaPositionReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_POSITION);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) return VarkenzaLostSession(playerid);
    if (PlayerManualSave[playerid]) {
        if (response_code == 200) SendClientMessage(playerid, VK_GREEN, "Position saved in database.");
        else if (response_code == 429) SendClientMessage(playerid, VK_GREY, "Position recently saved. Try again in 20 seconds.");
        else SendClientMessage(playerid, VK_RED, "Position not saved.");
    }
    PlayerManualSave[playerid] = false;
    return 1;
}
stock VarkenzaStopSpectating(playerid) {
    if (!PlayerSpectating[playerid]) return SendClientMessage(playerid, VK_GREY, "You are not spectating.");
    PlayerSpectating[playerid] = false;
    PlayerReturnSpec[playerid] = true;
    TogglePlayerSpectating(playerid, false);
    SendClientMessage(playerid, VK_GREY, "Spectate ended. Returning to your previous location.");
    return 1;
}
stock VarkenzaStaffRequest(playerid, type, target, model, const chat[]) {
    if (!PlayerLinked[playerid] || !PlayerStaff[playerid]) return SendClientMessage(playerid, VK_RED, "Use /link then /staff CODE first.");
    if (PlayerAction[playerid] != VK_ACTION_NONE) return SendClientMessage(playerid, VK_RED, "Wait for previous request.");
    if (PlayerSpectating[playerid] && type != VK_STAFF_SPECOFF && type != VK_STAFF_CHAT) return SendClientMessage(playerid, VK_RED, "Exit spectate first: /specoff.");
    new action[16], body[512], url[128];
    if (type == VK_STAFF_GOTO) format(action, sizeof(action), "GOTO");
    else if (type == VK_STAFF_GETHERE) format(action, sizeof(action), "GETHERE");
    else if (type == VK_STAFF_FREEZE) format(action, sizeof(action), "FREEZE");
    else if (type == VK_STAFF_UNFREEZE) format(action, sizeof(action), "UNFREEZE");
    else if (type == VK_STAFF_SPEC) format(action, sizeof(action), "SPEC");
    else if (type == VK_STAFF_SPECOFF) format(action, sizeof(action), "SPECOFF");
    else if (type == VK_STAFF_VEH) format(action, sizeof(action), "VEH");
    else if (type == VK_STAFF_CHAT) format(action, sizeof(action), "CHAT");
    else return 1;
    PlayerStaffTarget[playerid] = INVALID_PLAYER_ID;
    PlayerStaffTargetSID[playerid][0] = 0;
    if (type >= VK_STAFF_GOTO && type <= VK_STAFF_SPEC) {
        if (target < 0 || target >= MAX_PLAYERS || !IsPlayerConnected(target) || !PlayerLinked[target] || target == playerid) return SendClientMessage(playerid, VK_RED, "Target must be another linked online player.");
        PlayerStaffTarget[playerid] = target;
        PlayerStaffTargetEpoch[playerid] = PlayerEpoch[target];
        format(PlayerStaffTargetSID[playerid], 49, "%s", PlayerSID[target]);
        format(body, sizeof(body), "key=%s&sid=%s&action=%s&target=%s", VK_BRIDGE_SECRET, PlayerSID[playerid], action, PlayerSID[target]);
    } else if (type == VK_STAFF_VEH) {
        if (model < 400 || model > 611) return SendClientMessage(playerid, VK_RED, "Model must be between 400 and 611.");
        format(body, sizeof(body), "key=%s&sid=%s&action=%s&model=%d", VK_BRIDGE_SECRET, PlayerSID[playerid], action, model);
    } else if (type == VK_STAFF_CHAT) {
        if (strlen(chat) < 1 || strlen(chat) > 90) return SendClientMessage(playerid, VK_RED, "Use /a ASCII text up to 90 characters.");
        new encoded[300];
        if (!VarkenzaEncodeReport(chat, encoded, sizeof(encoded))) return SendClientMessage(playerid, VK_RED, "Use ASCII for staff chat.");
        format(PlayerStaffMessage[playerid], 110, "%s", chat);
        format(body, sizeof(body), "key=%s&sid=%s&action=%s&message=%s", VK_BRIDGE_SECRET, PlayerSID[playerid], action, encoded);
    } else format(body, sizeof(body), "key=%s&sid=%s&action=%s", VK_BRIDGE_SECRET, PlayerSID[playerid], action);
    PlayerStaffVehModel[playerid] = model;
    PlayerStaffCommand[playerid] = type;
    format(url, sizeof(url), "%s/api/game/staff-command", VK_BRIDGE_URL);
    if (HTTP(VarkenzaRequestIndex(playerid), HTTP_POST, url, body, "VarkenzaStaffCommandReply")) PlayerAction[playerid] = VK_ACTION_STAFF_COMMAND;
    else SendClientMessage(playerid, VK_RED, "Staff API unavailable.");
    return 1;
}
public VarkenzaStaffLinkReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_STAFF_LINK);
    if (playerid < 0) return 1;
    if (response_code != 200) return SendClientMessage(playerid, VK_RED, "Staff code invalid/expired or account lacks staff rights.");
    PlayerStaff[playerid] = true;
    SendClientMessage(playerid, VK_GREEN, "Staff session active. Commands: /a /goto /gethere /freeze /unfreeze /spec /specoff /veh");
    return 1;
}
public VarkenzaStaffOffReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_STAFF_OFF);
    if (playerid < 0) return 1;
    if (response_code == 401 || response_code == 403) {
        VarkenzaRevokeStaff(playerid);
        return SendClientMessage(playerid, VK_RED, "Staff authorization expired.");
    }
    if (response_code != 200) return SendClientMessage(playerid, VK_RED, "Could not disable staff session. Try again.");
    VarkenzaRevokeStaff(playerid);
    SendClientMessage(playerid, VK_GREY, "Staff session disabled.");
    return 1;
}
public VarkenzaStaffCommandReply(index, response_code, data[]) {
    new playerid = VarkenzaValidReply(index, VK_ACTION_STAFF_COMMAND);
    if (playerid < 0) return 1;
    if (response_code != 200) {
        if (response_code == 401 || response_code == 403) VarkenzaRevokeStaff(playerid);
        return SendClientMessage(playerid, VK_RED, "Staff action denied by server or target disconnected.");
    }
    new type = PlayerStaffCommand[playerid];
    if (type == VK_STAFF_CHAT) {
        new name[MAX_PLAYER_NAME], line[160];
        GetPlayerName(playerid, name, sizeof(name));
        format(line, sizeof(line), "[STAFF] %s: %s", name, PlayerStaffMessage[playerid]);
        for (new i = 0; i < MAX_PLAYERS; i++) if (IsPlayerConnected(i) && PlayerStaff[i]) SendClientMessage(i, VK_ORANGE, line);
        return 1;
    }
    if (type == VK_STAFF_VEH) {
        new Float:x, Float:y, Float:z, Float:a;
        GetPlayerPos(playerid, x, y, z); GetPlayerFacingAngle(playerid, a);
        if (PlayerStaffVehicle[playerid] != INVALID_VEHICLE_ID) DestroyVehicle(PlayerStaffVehicle[playerid]);
        PlayerStaffVehicle[playerid] = CreateVehicle(PlayerStaffVehModel[playerid], x + 3.0, y, z + 1.0, a, -1, -1, 120);
        if (PlayerStaffVehicle[playerid] != INVALID_VEHICLE_ID) SetVehicleVirtualWorld(PlayerStaffVehicle[playerid], GetPlayerVirtualWorld(playerid));
        SendClientMessage(playerid, VK_GREEN, "Temporary admin vehicle created. /dv removes it.");
        return 1;
    }
    if (type == VK_STAFF_SPECOFF) {
        if (PlayerSpectating[playerid]) {
            PlayerSpectating[playerid] = false;
            PlayerReturnSpec[playerid] = true;
            TogglePlayerSpectating(playerid, false);
        }
        return 1;
    }
    new target = PlayerStaffTarget[playerid];
    if (target < 0 || target >= MAX_PLAYERS || !IsPlayerConnected(target) || PlayerEpoch[target] != PlayerStaffTargetEpoch[playerid]
        || strcmp(PlayerSID[target], PlayerStaffTargetSID[playerid])) return SendClientMessage(playerid, VK_RED, "Target left or changed session.");
    new Float:x, Float:y, Float:z;
    if (type == VK_STAFF_GOTO) {
        GetPlayerPos(target, x, y, z);
        SetPlayerInterior(playerid, GetPlayerInterior(target)); SetPlayerVirtualWorld(playerid, GetPlayerVirtualWorld(target));
        SetPlayerPos(playerid, x + 1.5, y, z + 0.5);
    } else if (type == VK_STAFF_GETHERE) {
        GetPlayerPos(playerid, x, y, z);
        SetPlayerInterior(target, GetPlayerInterior(playerid)); SetPlayerVirtualWorld(target, GetPlayerVirtualWorld(playerid));
        SetPlayerPos(target, x + 1.5, y, z + 0.5);
    } else if (type == VK_STAFF_FREEZE) TogglePlayerControllable(target, false);
    else if (type == VK_STAFF_UNFREEZE) TogglePlayerControllable(target, true);
    else if (type == VK_STAFF_SPEC) {
        GetPlayerPos(playerid, PlayerReturnX[playerid], PlayerReturnY[playerid], PlayerReturnZ[playerid]);
        PlayerReturnInterior[playerid] = GetPlayerInterior(playerid); PlayerReturnWorld[playerid] = GetPlayerVirtualWorld(playerid);
        PlayerSpectating[playerid] = true;
        SetPlayerInterior(playerid, GetPlayerInterior(target)); SetPlayerVirtualWorld(playerid, GetPlayerVirtualWorld(target));
        TogglePlayerSpectating(playerid, true); PlayerSpectatePlayer(playerid, target);
    }
    SendClientMessage(playerid, VK_GREEN, "Staff action authorized and applied locally.");
    return 1;
}
