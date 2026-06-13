// app.js - Web Serial API, NMEA 0183 Parser, Visualizations, and Diagnostic Logic

// DOM Elements
const baudRateSelect = document.getElementById('baudRateSelect');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const coldStartBtn = document.getElementById('coldStartBtn');

// GPS Device Tester Elements
const cmdConnectBtn = document.getElementById('cmdConnectBtn');
const cmdDisconnectBtn = document.getElementById('cmdDisconnectBtn');
const cmdRunTestBtn = document.getElementById('cmdRunTestBtn');
const cmdInstructionsCard = document.getElementById('cmdInstructionsCard');
const cmdTestLoader = document.getElementById('cmdTestLoader');
const cmdResultsCard = document.getElementById('cmdResultsCard');
const cmdLogTerminal = document.getElementById('cmdLogTerminal');
const cmdTesterStatusBadge = document.getElementById('cmdTesterStatusBadge');
const cmdTesterStatusText = document.getElementById('cmdTesterStatusText');

const profileBobBtn = document.getElementById('profileBobBtn');
const profileSbiBtn = document.getElementById('profileSbiBtn');
const convertBobBtn = document.getElementById('convertBobBtn');
const convertSbiBtn = document.getElementById('convertSbiBtn');
const conversionStatusBox = document.getElementById('conversionStatusBox');

const connStatusBadge = document.getElementById('connStatusBadge');
const fixStatusBadge = document.getElementById('fixStatusBadge');
const antennaStatusBadge = document.getElementById('antennaStatusBadge');

const vccValue = document.getElementById('vccValue');
const antPowerValue = document.getElementById('antPowerValue');
const antPathValue = document.getElementById('antPathValue');
const antStatusValue = document.getElementById('antStatusValue');
const warningsContainer = document.getElementById('warningsContainer');

const networkLockBadge = document.getElementById('networkLockBadge');
const networkLockExplanation = document.getElementById('networkLockExplanation');

const lockTypeValue = document.getElementById('lockTypeValue');
const satsInUseValue = document.getElementById('satsInUseValue');
const satsInViewValue = document.getElementById('satsInViewValue');
const avgSnrValue = document.getElementById('avgSnrValue');
const latitudeValue = document.getElementById('latitudeValue');
const longitudeValue = document.getElementById('longitudeValue');
const altitudeValue = document.getElementById('altitudeValue');
const hdopValue = document.getElementById('hdopValue');
const timeValue = document.getElementById('timeValue');

const radarCanvas = document.getElementById('radarCanvas');
const snrBarsContainer = document.getElementById('snrBarsContainer');

const terminalLog = document.getElementById('terminalLog');
const nmeaFilterSelect = document.getElementById('nmeaFilterSelect');
const pauseLogBtn = document.getElementById('pauseLogBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const copyLogBtn = document.getElementById('copyLogBtn');

const errorModal = document.getElementById('errorModal');
const errorModalMessage = document.getElementById('errorModalMessage');
const errorModalOkBtn = document.getElementById('errorModalOkBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// Navigation Elements
const navGpsTestBtn = document.getElementById('navGpsTestBtn');
const navCmdTestBtn = document.getElementById('navCmdTestBtn');
const gpsTestView = document.getElementById('gpsTestView');
const commandTestView = document.getElementById('commandTestView');

// Application State
let port = null;
let reader = null;
let writer = null;
let keepReading = false;
let currentBaudRate = null;
let serialReadPromise = null;
let buffer = "";

// Device Tester State & Constants
let activeProfile = 'bob'; // 'bob' or 'sbi'
let sbiUnlockState = 'idle'; // 'idle', 'unlocking', 'unlocked', 'failed'
const SBI_UNLOCK_KEY = "ID0BMDQD5CpCxCtCmByBsBKD7C2CpCwCJDMD6BECVBgCbC6CbCsBPCDDzByCsCKDCDQDPDZChCaBACqBCCDC8BKC1BACMCOCNCECVBoCpC0ChC1CLD7C3CrCrBOCOCPCGCpBzBwB4BrB8BHCwBzBnCuC3CODOD5CYC1CaBACoB4BKC8BSDFD\r\n";
const BOB_CONVERSION_KEY = "ID0BMDQD5CpCxCtCmByBsBKD7C2CpCwCJDMD6BECVBgCbC6CbCsBPCDDnByCsCKDCDQDPDZChCaBACqBCCDC8BKC1BACMCOCNCECVBoCpC0ChC1CLD7C3CrCrBOCOCPCGCpBzBwB4BrB8BHCwBzBnCuC3CODOD5CYC1CaBACoB4BKC8BSDFD\r\n";

let activeQueries = {
    get_device_info: null,
    get_location: null,
    disable_encryption: null,
    enable_encryption: null,
    sbi_handshake: null
};

let lastDeviceLocationData = null;


let isPaused = false;
let nmeaFilter = 'ALL';
let isDemoMode = false;
let demoTimer = null;
let demoStep = 0;

let lastDataReceivedTime = 0;
let vccCheckInterval = null;

// GNSS Parser State
const state = {
    connected: false,
    vccOk: false,
    
    // Antenna diagnostics
    antennaStatus: 'Unknown', // Normal, Open Circuit, Short Circuit, Unknown
    antennaMode: 'Unknown',   // Auto, Internal, External, Unknown
    antennaPower: 'Unknown',  // Power On, Power Off, Unknown
    
    // Satellites
    satsInView: 0,
    satsInUse: 0,
    satellites: {}, // Map of PRN -> { elevation, azimuth, snr, system, lastUpdated }
    averageSnr: 0,
    
    // Position Fix
    fixOk: false,
    fixType: 'No Fix', // No Fix, 2D Fix, 3D Fix
    latitude: null,
    longitude: null,
    altitude: null,
    hdop: null,
    utcTime: null,
    
    // NMEA Log
    logLines: []
};

// Constellation identifiers from Talker ID or PRN ranges
const SYSTEM_GPS     = 'GPS';
const SYSTEM_GLONASS = 'GLONASS';
const SYSTEM_GALILEO = 'Galileo';
const SYSTEM_BEIDOU  = 'BeiDou';
const SYSTEM_NAVIC   = 'NavIC';

// Initialize Canvas
const ctx = radarCanvas.getContext('2d');
const radarWidth = radarCanvas.width;
const radarHeight = radarCanvas.height;
const centerX = radarWidth / 2;
const centerY = radarHeight / 2;
const maxRadius = (radarWidth / 2) - 20;

// Initialize Page
window.addEventListener('DOMContentLoaded', () => {
    drawRadarGrid();
    setupEventListeners();
    startUiUpdateLoop();
    checkAuthentication();
});

// Setup Event Listeners
function setupEventListeners() {
    // Auth listeners
    if (sendOtpBtn) sendOtpBtn.addEventListener('click', handleSendOtp);
    if (verifyOtpBtn) verifyOtpBtn.addEventListener('click', handleVerifyOtp);
    if (backToEmailBtn) backToEmailBtn.addEventListener('click', () => {
        loginStepOtp.style.display = 'none';
        loginStepEmail.style.display = 'block';
        loginStatus.style.display = 'none';
    });
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    connectBtn.addEventListener('click', connectDevice);
    disconnectBtn.addEventListener('click', disconnectDevice);
    coldStartBtn.addEventListener('click', handleColdStart);
    
    pauseLogBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseLogBtn.textContent = isPaused ? 'Resume' : 'Pause';
        pauseLogBtn.classList.toggle('btn-secondary', !isPaused);
        logTerminalMessage(`[SYSTEM] Log output ${isPaused ? 'PAUSED' : 'RESUMED'}.`, 'system-msg');
    });
    
    clearLogBtn.addEventListener('click', () => {
        terminalLog.innerHTML = "";
        state.logLines = [];
        logTerminalMessage("[SYSTEM] Terminal cleared.", "system-msg");
    });
    
    copyLogBtn.addEventListener('click', () => {
        const text = state.logLines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            logTerminalMessage("[SYSTEM] Terminal logs copied to clipboard.", "info-msg");
        }).catch(err => {
            logTerminalMessage("[SYSTEM] Copy failed: " + err, "error-msg");
        });
    });
    
    nmeaFilterSelect.addEventListener('change', (e) => {
        nmeaFilter = e.target.value;
        logTerminalMessage(`[SYSTEM] NMEA terminal filter set to: ${nmeaFilter}`, "system-msg");
    });
    
    // Modal controls
    const hideModal = () => errorModal.classList.remove('active');
    errorModalOkBtn.addEventListener('click', hideModal);
    closeModalBtn.addEventListener('click', hideModal);
    
    // GPS Device Test triggers
    if (cmdConnectBtn) cmdConnectBtn.addEventListener('click', connectDevice);
    if (cmdDisconnectBtn) cmdDisconnectBtn.addEventListener('click', disconnectDevice);
    if (cmdRunTestBtn) cmdRunTestBtn.addEventListener('click', runDeviceTest);

    // Target Profile selection buttons
    if (profileBobBtn) {
        profileBobBtn.addEventListener('click', () => {
            activeProfile = 'bob';
            profileBobBtn.style.background = 'var(--primary)';
            profileBobBtn.style.color = '#000000';
            profileBobBtn.style.borderColor = 'var(--primary)';
            profileBobBtn.style.boxShadow = '0 0 10px var(--primary-glow)';
            
            if (profileSbiBtn) {
                profileSbiBtn.style.background = 'transparent';
                profileSbiBtn.style.color = 'var(--text-muted)';
                profileSbiBtn.style.borderColor = 'transparent';
                profileSbiBtn.style.boxShadow = 'none';
            }
            logTerminalMessage("[SYSTEM] Switched to BOB testing profile.", "system-msg");
            logToCmdConsole("Switched target profile to: BOB", "info");
            sbiUnlockState = 'idle';
        });
    }
    
    if (profileSbiBtn) {
        profileSbiBtn.addEventListener('click', () => {
            activeProfile = 'sbi';
            profileSbiBtn.style.background = 'var(--primary)';
            profileSbiBtn.style.color = '#000000';
            profileSbiBtn.style.borderColor = 'var(--primary)';
            profileSbiBtn.style.boxShadow = '0 0 10px var(--primary-glow)';
            
            if (profileBobBtn) {
                profileBobBtn.style.background = 'transparent';
                profileBobBtn.style.color = 'var(--text-muted)';
                profileBobBtn.style.borderColor = 'transparent';
                profileBobBtn.style.boxShadow = 'none';
            }
            logTerminalMessage("[SYSTEM] Switched to SBI testing profile.", "system-msg");
            logToCmdConsole("Switched target profile to: SBI", "info");
        });
    }

    // Hardware Mode Conversion buttons
    if (convertBobBtn) {
        convertBobBtn.addEventListener('click', convertDeviceToBob);
    }
    if (convertSbiBtn) {
        convertSbiBtn.addEventListener('click', convertDeviceToSbi);
    }



    // View Switcher Event Listeners
    if (navGpsTestBtn && navCmdTestBtn && gpsTestView && commandTestView) {
        navGpsTestBtn.addEventListener('click', async () => {
            navGpsTestBtn.classList.add('active');
            navCmdTestBtn.classList.remove('active');
            gpsTestView.style.display = 'block';
            commandTestView.style.display = 'none';
            logTerminalMessage("[SYSTEM] Switched to GPS Test View.", "system-msg");
            
            if (state.connected && !isDemoMode) {
                const targetBaud = parseInt(baudRateSelect.value) || 115200;
                await changeBaudRate(targetBaud);
            }
            sendGpsForwardingCommand(true);
        });
        
        navCmdTestBtn.addEventListener('click', async () => {
            navCmdTestBtn.classList.add('active');
            navGpsTestBtn.classList.remove('active');
            gpsTestView.style.display = 'none';
            commandTestView.style.display = 'block';
            logTerminalMessage("[SYSTEM] Switched to Command Test View.", "system-msg");
            
            if (state.connected && !isDemoMode) {
                await changeBaudRate(9600);
            }
            sendGpsForwardingCommand(false);
        });
    }
}

// Show Error Modal
function showError(message) {
    errorModalMessage.textContent = message;
    errorModal.classList.add('active');
}

async function writeSerial(data) {
    if (isDemoMode) {
        // Simulating writing to device in demo mode
        setTimeout(() => {
            if (data === SBI_UNLOCK_KEY) {
                logTerminalMessage("[RAW] BMDQ CHALLENGE RECEIVED FROM DEVICE (DEMO)", "system-msg");
                const challenge = "ID0BMDQ_CHALLENGE_ACTIVE_KEY_12345";
                if (activeProfile === 'sbi' && sbiUnlockState === 'unlocking') {
                    logTerminalMessage(`[SYSTEM] SBI signature challenge detected.`, "warning-msg");
                    logToCmdConsole("SBI challenge detected. Sending disable_encryption command...", "info");
                    sbiUnlockState = 'unlocking_sent_disable';
                    logTerminalMessage("[SYSTEM] Sending disable_encryption command...", "warning-msg");
                    setTimeout(() => {
                        handleJsonMessage(JSON.stringify({
                            status: "success",
                            command: "disable_encryption",
                            message: "Encryption disabled and saved"
                        }));
                    }, 800);
                }
            } else if (data === BOB_CONVERSION_KEY) {
                logTerminalMessage("[RAW] BMDQ CONVERSION CHALLENGE RECEIVED (DEMO)", "system-msg");
            }
        }, 500);
        return;
    }

    if (!writer) return;
    try {
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(data));
    } catch (e) {
        console.error("writeSerial error:", e);
    }
}

async function changeBaudRate(newBaudRate) {
    if (!port || !state.connected || isDemoMode) return;
    
    if (currentBaudRate === newBaudRate) {
        logTerminalMessage(`[SYSTEM] Already connected at ${newBaudRate} baud. No dynamic switch needed.`, "system-msg");
        return;
    }
    
    try {
        logTerminalMessage(`[SYSTEM] Switching serial baud rate to ${newBaudRate} for this view...`, "system-msg");
        
        keepReading = false;
        if (reader) {
            try {
                await reader.cancel();
                reader.releaseLock();
            } catch (e) {}
            reader = null;
        }
        if (writer) {
            try {
                writer.releaseLock();
            } catch (e) {}
            writer = null;
        }
        
        await port.close();
        
        // Open port with new baud rate
        await port.open({ baudRate: newBaudRate });
        
        // Recreate reader and writer streams
        reader = port.readable.getReader();
        writer = port.writable.getWriter();
        
        currentBaudRate = newBaudRate;
        keepReading = true;
        readSerialData();
        
        logTerminalMessage(`[SYSTEM] Reconnected successfully at ${newBaudRate} baud.`, "info-msg");
    } catch (err) {
        console.error("Failed to change baud rate dynamically:", err);
        logTerminalMessage(`[SYSTEM] Failed to switch baud rate: ${err.message}`, "error-msg");
        showError("Baud rate switch failed. Please disconnect and connect again.");
        disconnectDevice();
    }
}

// Connect Device Action
async function connectDevice() {
    if (!navigator.serial) {
        showError("Web Serial API is not supported by your browser. Please ensure you are running this app via http://localhost:8080 (our PowerShell server) and using Google Chrome or Microsoft Edge.");
        askToStartDemo("Web Serial API Not Supported");
        return;
    }
    
    try {
        const isCmdActive = commandTestView && commandTestView.style.display !== 'none';
        const baudRate = isCmdActive ? 9600 : parseInt(baudRateSelect.value);
        port = await navigator.serial.requestPort();
        
        await port.open({ baudRate });
        
        state.connected = true;
        state.vccOk = true;
        lastDataReceivedTime = Date.now();
        currentBaudRate = baudRate;
        
        // Setup Streams directly
        reader = port.readable.getReader();
        writer = port.writable.getWriter();
        
        keepReading = true;
        readSerialData();
        
        // Monitor main power supply
        startPowerMonitor();
        
        logTerminalMessage(`[SYSTEM] Connected to serial port. Baud rate: ${baudRate}`, "info-msg");
        
        // Send initial mode command based on current active tab (increased delay to 1500ms for ESP32 boot time)
        setTimeout(() => {
            const isGpsActive = gpsTestView && gpsTestView.style.display !== 'none';
            sendGpsForwardingCommand(isGpsActive);
            
            // Setup initial state for SBI unlocking or BOB state logging
            sbiUnlockState = 'idle';
            if (isCmdActive) {
                if (cmdLogTerminal) cmdLogTerminal.innerHTML = "";
                logToCmdConsole(`Connected to device in ${activeProfile.toUpperCase()} Mode.`, "info");
                
                if (activeProfile === 'sbi') {
                    logToCmdConsole("SBI Profile selected. Ready for command test or conversion.", "info");
                }
            }
        }, 1500);
    } catch (err) {
        console.error(err);
        if (err.name !== 'NotFoundError') {
            showError("Could not connect to the selected serial port: " + err.message);
        } else {
            askToStartDemo("Connection Cancelled");
        }
    }
}

// Ask User to start Demo Mode
function askToStartDemo(reason) {
    const isUrlDemo = window.location.search.includes('demo=true') || window.location.search.includes('simulator=true');
    if (isUrlDemo) {
        startDemoMode();
        return;
    }
    const startDemo = confirm(`${reason}.\n\nWould you like to start in Demo / Simulation Mode to test the diagnostic features of the L89 module (simulating VCC checks, antenna short-circuits, and satellite locks)?`);
    if (startDemo) {
        startDemoMode();
    }
}

// Disconnect Device Action
async function disconnectDevice() {
    if (isDemoMode) {
        stopDemoMode();
        return;
    }
    
    stopPowerMonitor();
    
    // Send cleanup commands before closing port to exit Test Mode
    if (writer) {
        try {
            logTerminalMessage("[SYSTEM] Sending exit test mode / cleanup commands...", "system-msg");
            const encoder = new TextEncoder();
            
            // 1. Stop NMEA raw GPS data streaming
            const stopGpsCmd = JSON.stringify({ command: "stop_raw_gps_data" }) + "\r\n";
            await writer.write(encoder.encode(stopGpsCmd));
            
            // 2. Enable encryption to exit test mode (ONLY for SBI devices that were unlocked to secure them back)
            const isGpsActive = gpsTestView && gpsTestView.style.display !== 'none';
            if (activeProfile === 'sbi' && sbiUnlockState === 'unlocked' && !isGpsActive) {
                logTerminalMessage("[SYSTEM] SBI profile active and device was unlocked. Re-securing device (enabling encryption)...", "system-msg");
                const enableEncCmd = JSON.stringify({ command: "enable_encryption" }) + "\r\n";
                await writer.write(encoder.encode(enableEncCmd));
            } else {
                logTerminalMessage("[SYSTEM] BOB profile active or device not unlocked/in GPS mode. Leaving device in BOB mode.", "system-msg");
            }
            
            // Small delay for serial transfer buffer to flush
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (e) {
            console.error("Cleanup commands failed:", e);
        }
    }
    
    keepReading = false;
    
    if (reader) {
        try {
            await reader.cancel();
            reader.releaseLock();
        } catch (e) {
            console.log("Reader cancel warning:", e);
        }
        reader = null;
    }
    
    if (writer) {
        try {
            writer.releaseLock();
        } catch (e) {
            console.log("Writer release warning:", e);
        }
        writer = null;
    }
    
    if (port) {
        try {
            await port.close();
        } catch (e) {
            showError("Error closing port: " + e.message);
        }
        port = null;
    }
    
    state.connected = false;
    state.vccOk = false;
    currentBaudRate = null;
    resetGnssState();
    
    logTerminalMessage("[SYSTEM] Disconnected from device.", "system-msg");
}

// Write standard restart commands to module
async function handleColdStart() {
    if (isDemoMode) {
        logTerminalMessage("[DEMO] Sending Cold Start command. Resetting simulation steps.", "warning-msg");
        demoStep = 0;
        resetGnssState();
        return;
    }
    
    if (!writer) return;
    
    try {
        logTerminalMessage("[SYSTEM] Sending Cold Start command sequence...", "warning-msg");
        
        await writeSerial("$PMTK103*30\r\n");
        await writeSerial("$PAIR004*3D\r\n");
        await writeSerial("$PSTMINITGPS,0*40\r\n");
        
        logTerminalMessage("[SYSTEM] Cold Start triggers dispatched successfully.", "info-msg");
    } catch (err) {
        logTerminalMessage("[SYSTEM] Cold Start command failed to transmit: " + err.message, "error-msg");
    }
}

// Start watching if bytes are coming (6s threshold for tolerance with 1Hz GNSS modules)
function startPowerMonitor() {
    vccCheckInterval = setInterval(() => {
        const timeSinceLastByte = Date.now() - lastDataReceivedTime;
        if (timeSinceLastByte > 6000) {
            if (state.vccOk) {
                state.vccOk = false;
                logTerminalMessage("[POWER] Warning: No data received from module in the last 6 seconds. Check VCC power connection and RX/TX serial pins.", "error-msg");
            }
        } else {
            state.vccOk = true;
        }
    }, 1000);
}

// Stop watching power
function stopPowerMonitor() {
    if (vccCheckInterval) {
        clearInterval(vccCheckInterval);
        vccCheckInterval = null;
    }
}

// Web Serial stream reader loop
async function readSerialData() {
    const decoder = new TextDecoder();
    try {
        while (keepReading) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }
            if (value) {
                lastDataReceivedTime = Date.now();
                buffer += decoder.decode(value, { stream: true });
                
                let lineBreakIndex = buffer.indexOf('\n');
                while (lineBreakIndex !== -1) {
                    const sentence = buffer.substring(0, lineBreakIndex).trim();
                    buffer = buffer.substring(lineBreakIndex + 1);
                    
                    const dollarIndex = sentence.indexOf('$');
                    if (dollarIndex !== -1) {
                        const cleanSentence = sentence.substring(dollarIndex);
                        parseSentence(cleanSentence);
                    } else {
                        // Check for SBI signatures
                        if (sentence.includes("ID0B") || sentence.includes("BMDQ")) {
                            if (activeQueries['sbi_handshake']) {
                                const resolveCallback = activeQueries['sbi_handshake'];
                                activeQueries['sbi_handshake'] = null;
                                resolveCallback(sentence);
                            }
                            if (activeQueries['enable_encryption']) {
                                const resolveCallback = activeQueries['enable_encryption'];
                                activeQueries['enable_encryption'] = null;
                                resolveCallback({ status: 'success', command: 'enable_encryption', message: 'Encryption enabled' });
                            }
                            if (activeProfile === 'bob') {
                                logToCmdConsole("HARDWARE WARNING: Device is outputting SBI data (ID0B/BMDQ). This is an SBI device! Please switch the profile to SBI or convert the device to BOB mode.", "fail");
                            } else if (activeProfile === 'sbi') {
                                logTerminalMessage(`[SYSTEM] SBI signature challenge detected.`, "warning-msg");
                            }
                        }

                        const firstBrace = sentence.indexOf('{');
                        const lastBrace = sentence.lastIndexOf('}');
                        if (firstBrace !== -1 && lastBrace > firstBrace) {
                            const jsonPart = sentence.substring(firstBrace, lastBrace + 1);
                            if (activeQueries['sbi_handshake']) {
                                const resolveCallback = activeQueries['sbi_handshake'];
                                activeQueries['sbi_handshake'] = null;
                                resolveCallback({ isBobDeviceError: true, rawJson: jsonPart });
                                return;
                            }
                            handleJsonMessage(jsonPart);
                        } else if (sentence.trim().length > 0) {
                            logTerminalMessage(`[RAW] ${sentence}`, "system-msg");
                        }
                    }
                    lineBreakIndex = buffer.indexOf('\n');
                }
            }
        }
    } catch (err) {
        console.error("Read serial stream error:", err);
        logTerminalMessage("[SYSTEM] Reader thread error: " + err.message, "error-msg");
        disconnectDevice();
    }
}

// NMEA Checksum Verification
function verifyChecksum(sentence) {
    const starIdx = sentence.lastIndexOf('*');
    if (starIdx === -1 || starIdx + 3 > sentence.length) return false;
    
    const dataToHash = sentence.substring(1, starIdx);
    const checksumStr = sentence.substring(starIdx + 1, starIdx + 3);
    const expectedChecksum = parseInt(checksumStr, 16);
    
    let actualChecksum = 0;
    for (let i = 0; i < dataToHash.length; i++) {
        actualChecksum ^= dataToHash.charCodeAt(i);
    }
    
    return actualChecksum === expectedChecksum;
}

// MAIN NMEA PARSER
function parseSentence(sentence) {
    // 1. Verify Checksum
    if (!verifyChecksum(sentence)) {
        logTerminalMessage(`[BAD CHECKSUM] ${sentence}`, 'error-msg');
        return;
    }
    
    // Log to terminal
    logSentenceToTerminal(sentence);
    
    const starIdx = sentence.lastIndexOf('*');
    const coreSentence = sentence.substring(0, starIdx);
    const parts = coreSentence.split(',');
    const header = parts[0];
    const sentenceType = header.substring(3); // GGA, GSV, GSA, etc.
    const talker = header.substring(1, 3);    // GP, GL, GA, GB, GN
    
    // Parse standard sentences
    if (sentenceType === 'GGA') {
        parseGGA(parts);
    } else if (sentenceType === 'GSA') {
        parseGSA(parts);
    } else if (sentenceType === 'GSV') {
        parseGSV(parts, talker);
    } else if (header.includes('ANTENNASTATUS') || header === '$PQTMANTENNASTATUS' || header === '$PSTMANTENNASTATUS') {
        parseAntennaStatus(parts);
    }
}

// Parse GGA (Global Positioning System Fix Data)
function parseGGA(parts) {
    if (parts.length < 10) return;
    
    // UTC Time (hhmmss.ss)
    const rawTime = parts[1];
    if (rawTime && rawTime.length >= 6) {
        state.utcTime = `${rawTime.substring(0,2)}:${rawTime.substring(2,4)}:${rawTime.substring(4,6)} UTC`;
    }
    
    // Position Fix Quality Indicator
    const fixQuality = parseInt(parts[6]) || 0;
    state.fixOk = (fixQuality > 0);
    
    // Satellites in Use
    state.satsInUse = parseInt(parts[7]) || 0;
    
    // HDOP
    state.hdop = parseFloat(parts[8]) || null;
    
    // Altitude
    state.altitude = parseFloat(parts[9]) || null;
    
    // Coordinates
    if (state.fixOk) {
        const rawLat = parts[2];
        const latDir = parts[3];
        const rawLon = parts[4];
        const lonDir = parts[5];
        
        state.latitude = parseCoordinate(rawLat, latDir, 2);
        state.longitude = parseCoordinate(rawLon, lonDir, 3);
    } else {
        state.latitude = null;
        state.longitude = null;
    }
}

// Convert NMEA Coordinate string (DDMM.MMMM) to Decimal Degrees
function parseCoordinate(value, direction, degDigits) {
    if (!value || !direction) return null;
    const deg = parseFloat(value.substring(0, degDigits));
    const min = parseFloat(value.substring(degDigits));
    let decimal = deg + (min / 60);
    if (direction === 'S' || direction === 'W') {
        decimal = -decimal;
    }
    return decimal;
}

// Parse GSA (Active Satellites & Dilution of Precision)
function parseGSA(parts) {
    if (parts.length < 3) return;
    
    // Fix Type (1 = No Fix, 2 = 2D Fix, 3 = 3D Fix)
    const fixTypeIdx = parseInt(parts[2]) || 1;
    switch(fixTypeIdx) {
        case 2: state.fixType = '2D Fix'; break;
        case 3: state.fixType = '3D Fix'; break;
        default: state.fixType = 'No Fix';
    }
}

// Parse GSV (Satellites in View)
function parseGSV(parts, talker) {
    if (parts.length < 4) return;
    
    const msgNum = parseInt(parts[2]) || 1;
    
    // Map talker ID to satellite system name
    let system = SYSTEM_GPS;
    if      (talker === 'GL')                    system = SYSTEM_GLONASS;
    else if (talker === 'GA')                    system = SYSTEM_GALILEO;
    else if (talker === 'GB' || talker === 'BD') system = SYSTEM_BEIDOU;
    else if (talker === 'GI' || talker === 'QZ') system = SYSTEM_NAVIC;  // NavIC / IRNSS + QZSS
    
    // Satellites are in groups of 4 values: [PRN, Elevation, Azimuth, SNR]
    for (let i = 4; i < parts.length - 3; i += 4) {
        const prnVal = parts[i];
        if (!prnVal) continue;
        
        const prnNum = parseInt(prnVal);
        const prn = `${talker}_${prnVal}`; // Unique identifier
        const elevation = parseInt(parts[i+1]) || 0;
        const azimuth = parseInt(parts[i+2]) || 0;
        const snr = parseInt(parts[i+3]) || 0;

        // Skip satellites with invalid tracking coordinates (e.g. when antenna is unplugged)
        if (elevation === 0 && azimuth === 0) {
            continue;
        }
        
        // PRN-range override: some receivers report Galileo/BeiDou sats under $GPGSV
        let resolvedSystem = system;
        if (talker === 'GP') {
            if (prnNum >= 193 && prnNum <= 202) resolvedSystem = SYSTEM_GALILEO; // Galileo E1
            if (prnNum >= 201 && prnNum <= 236) resolvedSystem = SYSTEM_BEIDOU;  // BeiDou
        }
        
        state.satellites[prn] = {
            prnVal,
            elevation,
            azimuth,
            snr,
            system: resolvedSystem,
            lastUpdated: Date.now()
        };
    }
    
    cleanOldSatellites();
}

// Parse proprietary Antenna Status sentence ($PQTMANTENNASTATUS or $PSTMANTENNASTATUS)
function parseAntennaStatus(parts) {
    if (parts.length < 2) return;
    
    const detectEn  = parts[1];                              // Detection enable flag
    const statusVal = parts.length >= 3 ? parts[2] : '0';   // Antenna circuit status
    const powerVal  = parts.length >= 4 ? parts[3] : '0';   // Power control state
    
    // 1. Antenna Circuit Status (0=Normal, 1=Open Circuit, 2=Short Circuit)
    if      (statusVal === '1') state.antennaStatus = 'Open Circuit';
    else if (statusVal === '2') state.antennaStatus = 'Short Circuit';
    else                        state.antennaStatus = 'Normal';  // 0 = Normal
    
    // 2. Mode (based on detect_en flag)
    if      (detectEn === '0') state.antennaMode = 'Auto';     // Detection disabled = auto managed
    else if (detectEn === '1') state.antennaMode = 'External'; // Detection enabled = external active ant.
    else                       state.antennaMode = 'Auto';
    
    // 3. Antenna Power Supply State
    if (detectEn === '0') {
        state.antennaPower = 'Power On';
    } else {
        state.antennaPower = (powerVal === '0' || powerVal === '1') ? 'Power On' : 'Power Off';
    }
    
    // Special case: Short Circuit
    if (state.antennaStatus === 'Short Circuit') {
        state.antennaPower = 'Power Off';
    }
}

// Remove satellites that haven't sent reports in the last 8 seconds
function cleanOldSatellites() {
    const now = Date.now();
    const expiry = 8000;
    
    for (const prn in state.satellites) {
        if (now - state.satellites[prn].lastUpdated > expiry) {
            delete state.satellites[prn];
        }
    }
    
    // Update counters
    const activeSats = Object.values(state.satellites);
    state.satsInView = activeSats.length;
    
    // Calculate average SNR
    let snrSum = 0;
    let snrCount = 0;
    activeSats.forEach(sat => {
        if (sat.snr > 0) {
            snrSum += sat.snr;
            snrCount++;
        }
    });
    state.averageSnr = snrCount > 0 ? (snrSum / snrCount) : 0;
}

// Reset GNSS state values on disconnect or reboot
function resetGnssState() {
    state.antennaStatus = 'Unknown';
    state.antennaMode = 'Unknown';
    state.antennaPower = 'Unknown';
    state.satsInView = 0;
    state.satsInUse = 0;
    state.satellites = {};
    state.averageSnr = 0;
    state.fixOk = false;
    state.fixType = 'No Fix';
    state.latitude = null;
    state.longitude = null;
    state.altitude = null;
    state.hdop = null;
    state.utcTime = null;
    drawRadarGrid();
    renderSnrBars();
    
    // Reset Device Info response box
    const responseBox = document.getElementById('deviceInfoResponseBox');
    if (responseBox) {
        responseBox.textContent = "Waiting for query...";
        responseBox.className = 'response-box';
    }
    const responseStatusBadge = document.getElementById('responseStatusBadge');
    if (responseStatusBadge) {
        responseStatusBadge.style.display = 'none';
    }
}

// Log line output helper
function logTerminalMessage(msg, className = "") {
    state.logLines.push(msg);
    if (state.logLines.length > 250) {
        state.logLines.shift();
    }
    
    if (isPaused) return;
    
    const line = document.createElement('div');
    line.className = `terminal-line ${className}`;
    line.textContent = msg;
    terminalLog.appendChild(line);
    
    // Scroll lock to bottom
    terminalLog.scrollTop = terminalLog.scrollHeight;
}

// Format and filter NMEA lines for the log screen
function logSentenceToTerminal(sentence) {
    let show = false;
    let className = "";
    
    if (nmeaFilter === 'ALL') {
        show = true;
    } else if (nmeaFilter === 'GGA' && sentence.includes('GGA')) {
        show = true;
        className = 'info-msg';
    } else if (nmeaFilter === 'GSA' && sentence.includes('GSA')) {
        show = true;
    } else if (nmeaFilter === 'GSV' && sentence.includes('GSV')) {
        show = true;
    } else if (nmeaFilter === 'ANTENNA' && sentence.includes('ANTENNASTATUS')) {
        show = true;
        className = 'warning-msg';
    }
    
    if (show) {
        logTerminalMessage(sentence, className);
    } else {
        // Still keep in copy buffer
        state.logLines.push(sentence);
        if (state.logLines.length > 250) state.logLines.shift();
    }
}

// UI UPDATE LOOP
function startUiUpdateLoop() {
    setInterval(() => {
        updateDomState();
        drawRadarSatellites();
        renderSnrBars();
    }, 200);
}

// Map variables to HTML tags dynamically
function updateDomState() {
    const updateBadge = (badge, className, text) => {
        if (badge.className !== className) {
            badge.className = className;
        }
        const textEl = badge.querySelector('.badge-text');
        if (textEl && textEl.textContent !== text) {
            textEl.textContent = text;
        }
    };

    const sendDeviceInfoBtn = document.getElementById('sendDeviceInfoBtn');

    // 1. Connection Badge & Buttons Sync
    const isConn = state.connected || isDemoMode;
    if (isDemoMode) {
        updateBadge(connStatusBadge, "badge status-connected", "SIMULATOR ACTIVE");
        if (cmdTesterStatusBadge) cmdTesterStatusBadge.className = "badge status-connected";
        if (cmdTesterStatusText) cmdTesterStatusText.textContent = "SIMULATOR ACTIVE";
    } else if (state.connected) {
        updateBadge(connStatusBadge, "badge status-connected", "CONNECTED");
        if (cmdTesterStatusBadge) cmdTesterStatusBadge.className = "badge status-connected";
        if (cmdTesterStatusText) cmdTesterStatusText.textContent = "CONNECTED";
    } else {
        updateBadge(connStatusBadge, "badge status-disconnected", "DISCONNECTED");
        if (cmdTesterStatusBadge) cmdTesterStatusBadge.className = "badge status-disconnected";
        if (cmdTesterStatusText) cmdTesterStatusText.textContent = "Disconnected";
    }

    if (connectBtn) connectBtn.disabled = isConn;
    if (cmdConnectBtn) cmdConnectBtn.disabled = isConn;
    if (disconnectBtn) disconnectBtn.disabled = !isConn;
    if (cmdDisconnectBtn) cmdDisconnectBtn.disabled = !isConn;
    if (coldStartBtn) coldStartBtn.disabled = !isConn;
    if (baudRateSelect) baudRateSelect.disabled = isConn;
    if (cmdRunTestBtn) cmdRunTestBtn.disabled = !isConn;
    if (convertBobBtn) convertBobBtn.disabled = !isConn;
    if (convertSbiBtn) convertSbiBtn.disabled = !isConn;

    
    // 2. Position Fix Badge
    if (!state.connected && !isDemoMode) {
        updateBadge(fixStatusBadge, "badge fix-none", "NO LOCK");
    } else if (state.fixType === '3D Fix') {
        updateBadge(fixStatusBadge, "badge fix-3d", "3D LOCK");
    } else if (state.fixType === '2D Fix') {
        updateBadge(fixStatusBadge, "badge fix-2d", "2D LOCK");
    } else {
        updateBadge(fixStatusBadge, "badge fix-none", "NO LOCK");
    }
    
    // 3. Antenna Health Badge
    if (!state.connected && !isDemoMode) {
        updateBadge(antennaStatusBadge, "badge antenna-unknown", "ANTENNA: UNKNOWN");
    } else {
        const text = `ANTENNA: ${state.antennaStatus.toUpperCase()}`;
        let className = "badge antenna-unknown";
        if (state.antennaStatus === 'Normal') {
            className = "badge antenna-normal";
        } else if (state.antennaStatus === 'Open Circuit') {
            className = "badge antenna-open";
        } else if (state.antennaStatus === 'Short Circuit') {
            className = "badge antenna-short";
        }
        updateBadge(antennaStatusBadge, className, text);
    }
    
    // 4. Power Panel Values
    if (!state.connected && !isDemoMode) {
        vccValue.textContent = "INACTIVE";
        vccValue.className = "diag-value text-red";
        antPowerValue.textContent = "UNKNOWN";
        antPowerValue.className = "diag-value";
        antPathValue.textContent = "UNKNOWN";
        antPathValue.className = "diag-value";
        antStatusValue.textContent = "UNKNOWN";
        antStatusValue.className = "diag-value";
        
        const waitingHtml = `
            <div class="alert-box alert-info">
                <div class="alert-title">Waiting for device connection</div>
                <div class="alert-desc">Connect the L89 module serial port to analyze power and hardware parameters.</div>
            </div>
        `;
        if (warningsContainer.innerHTML !== waitingHtml) {
            warningsContainer.innerHTML = waitingHtml;
        }
    } else {
        // VCC Power Check
        if (state.vccOk) {
            vccValue.textContent = "OK (ACTIVE)";
            vccValue.className = "diag-value text-green";
        } else {
            vccValue.textContent = "NO FEED";
            vccValue.className = "diag-value text-red";
        }
        
        // Antenna Power (Power On/Off)
        antPowerValue.textContent = state.antennaPower.toUpperCase();
        if (state.antennaPower === 'Power On') antPowerValue.className = "diag-value text-green";
        else if (state.antennaPower === 'Power Off') antPowerValue.className = "diag-value text-red";
        else antPowerValue.className = "diag-value";
        
        // Antenna mode path
        if (state.antennaMode === 'External') {
            antPathValue.textContent = "EXTERNAL ACTIVE";
            antPathValue.className = "diag-value text-cyan";
        } else if (state.antennaMode === 'Internal') {
            antPathValue.textContent = "INTERNAL PATCH";
            antPathValue.className = "diag-value text-amber";
        } else if (state.antennaMode === 'Auto') {
            antPathValue.textContent = "AUTO (MANAGED)";
            antPathValue.className = "diag-value text-green";
        } else {
            antPathValue.textContent = state.antennaMode.toUpperCase();
            antPathValue.className = "diag-value";
        }
        
        // Antenna Status
        antStatusValue.textContent = state.antennaStatus.toUpperCase();
        if (state.antennaStatus === 'Normal') antStatusValue.className = "diag-value text-green";
        else if (state.antennaStatus === 'Open Circuit') antStatusValue.className = "diag-value text-amber";
        else if (state.antennaStatus === 'Short Circuit') antStatusValue.className = "diag-value text-red";
        else antStatusValue.className = "diag-value";
        
        // Warnings Evaluator
        updateWarningsPanel();
    }
    
    // 5. Position Stats
    lockTypeValue.textContent = state.fixType;
    if (state.fixType.includes('3D')) lockTypeValue.className = "font-orbitron font-bold text-green";
    else if (state.fixType.includes('2D')) lockTypeValue.className = "font-orbitron font-bold text-amber";
    else lockTypeValue.className = "font-orbitron font-bold text-red";
    
    satsInUseValue.textContent = state.satsInUse;
    satsInViewValue.textContent = state.satsInView;
    avgSnrValue.textContent = `${state.averageSnr.toFixed(1)} dBHz`;
    if (state.averageSnr > 35) avgSnrValue.className = "font-orbitron text-green";
    else if (state.averageSnr >= 25) avgSnrValue.className = "font-orbitron text-amber";
    else avgSnrValue.className = "font-orbitron text-red";
    
    latitudeValue.textContent = state.latitude !== null ? `${state.latitude.toFixed(6)}°` : '--.------°';
    longitudeValue.textContent = state.longitude !== null ? `${state.longitude.toFixed(6)}°` : '--.------°';
    altitudeValue.textContent = state.altitude !== null ? `${state.altitude.toFixed(1)} m` : '--.- m';
    hdopValue.textContent = state.hdop !== null ? state.hdop.toFixed(1) : '--.-';
    timeValue.textContent = state.utcTime !== null ? state.utcTime : '--:--:--';
    
    // 6. Network Lock Diagnostics Badge
    evaluateNetworkLockState();
}

// Generate alarm elements and advice blocks
function updateWarningsPanel() {
    const warnings = [];
    
    if (!state.vccOk) {
        warnings.push(`
            <div class="alert-box alert-danger">
                <div class="alert-title">❌ Power Alert: Serial Connection Dropped</div>
                <div class="alert-desc">Data bytes are no longer arriving from the serial chip. Check that the USB cable is fully plugged in, the module board VCC pin has 3.3V/5V supply, and TX/RX cables aren't loose.</div>
            </div>
        `);
        warningsContainer.innerHTML = warnings.join('');
        return; // Exit early
    }
    
    if (state.antennaStatus === 'Short Circuit') {
        warnings.push(`
            <div class="alert-box alert-danger">
                <div class="alert-title">⚠️ CRITICAL: Active Antenna Short Circuit</div>
                <div class="alert-desc">The L89 module detected a short circuit on the active antenna supply line. The module has <strong>automatically shut off the antenna power supply</strong> to protect internal hardware. Verify the antenna coax connector, cable insulation, and check for solder bridges on the board.</div>
            </div>
        `);
    } else if (state.antennaStatus === 'Open Circuit') {
        warnings.push(`
            <div class="alert-box alert-warning">
                <div class="alert-title">⚠️ Warning: External Antenna Not Detected</div>
                <div class="alert-desc">No external active antenna is drawing current. The L89 will operate using its internal chip/patch antenna. If an external antenna is connected, check if it's securely screwed into the connector and has a passive/active mismatch. For better indoor lock, attach an external active antenna.</div>
            </div>
        `);
    }
    
    if (state.connected || isDemoMode) {
        if (!state.fixOk) {
            if (state.satsInView < 3) {
                warnings.push(`
                    <div class="alert-box alert-warning">
                        <div class="alert-title">💡 Insufficient Satellites</div>
                        <div class="alert-desc">L89 is only seeing ${state.satsInView} satellites in the sky. GNSS engines require a minimum of 4 satellites to compute location coordinates. Move the antenna near a window, or test under open sky.</div>
                    </div>
                `);
            } else if (state.averageSnr < 25) {
                warnings.push(`
                    <div class="alert-box alert-warning">
                        <div class="alert-title">📡 Weak Sky Signals</div>
                        <div class="alert-desc">The average satellite signal strength is very low (${state.averageSnr.toFixed(1)} dBHz). Solid locks need signals above 28-30 dBHz. Make sure there are no thick walls, iron roofs, or heavy trees blocking the antenna's direct sky path.</div>
                    </div>
                `);
            } else {
                warnings.push(`
                    <div class="alert-box alert-info">
                        <div class="alert-title">⚙️ Cold Starting / Ephemeris Lock</div>
                        <div class="alert-desc">The module is receiving strong signals but is still downloading satellite orbits (ephemeris data). Keep the module completely still. Initial Time-To-First-Fix (TTFF) can take 30 to 60 seconds on cold boot.</div>
                    </div>
                `);
            }
        } else {
            warnings.push(`
                <div class="alert-box alert-success">
                    <div class="alert-title">✅ System Normal</div>
                    <div class="alert-desc">L89 GNSS hardware is operating within normal parameters. Power levels are normal, active antenna path is clear, and coordinates are locking successfully.</div>
                </div>
            `);
        }
    }
    
    const warningsHtml = warnings.join('');
    if (warningsContainer.innerHTML !== warningsHtml) {
        warningsContainer.innerHTML = warningsHtml;
    }
}

// Compute if network is connected or reason for lock issues
function evaluateNetworkLockState() {
    if (!state.connected && !isDemoMode) {
        networkLockBadge.textContent = "NOT NETWORK CONNECTED";
        networkLockBadge.className = "network-badge not-connected";
        networkLockExplanation.textContent = "Connect to your device via serial port to test the network lock.";
        return;
    }
    
    if (!state.vccOk) {
        networkLockBadge.textContent = "NOT NETWORK CONNECTED";
        networkLockBadge.className = "network-badge not-connected";
        networkLockExplanation.textContent = "Hardware power failure. No data coming from L89 serial pins.";
        return;
    }
    
    if (state.antennaStatus === 'Short Circuit') {
        networkLockBadge.textContent = "NOT NETWORK CONNECTED";
        networkLockBadge.className = "network-badge not-connected";
        networkLockExplanation.textContent = "Antenna short-circuit shutdown. GNSS signals blocked.";
        return;
    }
    
    if (!state.fixOk) {
        networkLockBadge.textContent = "NOT NETWORK CONNECTED";
        networkLockBadge.className = "network-badge not-connected";
        
        if (state.satsInView < 3) {
            networkLockExplanation.textContent = `Searching for satellites (only ${state.satsInView} visible, need >= 4). Check sky visibility.`;
        } else if (state.averageSnr < 25) {
            networkLockExplanation.textContent = `Poor signal quality (Avg SNR ${state.averageSnr.toFixed(1)} dBHz). Antenna is obstructed or unpowered.`;
        } else {
            networkLockExplanation.textContent = "Acquiring orbital coordinates (Ephemeris Syncing...). Keep antenna still.";
        }
    } else {
        // Fix is Ok. Check satellite density
        if (state.satsInUse < 4) {
            networkLockBadge.textContent = "NOT NETWORK CONNECTED";
            networkLockBadge.className = "network-badge not-connected";
            networkLockExplanation.textContent = `Position fix acquired but lacks accuracy (${state.satsInUse} satellites in use, need >= 4 for stable network lock).`;
        } else {
            networkLockBadge.textContent = "NETWORK CONNECTED";
            networkLockBadge.className = "network-badge connected";
            networkLockExplanation.textContent = `GNSS Lock Established! Connected via ${state.satsInUse} satellites. Signals excellent (Avg SNR: ${state.averageSnr.toFixed(1)} dBHz).`;
        }
    }
}

// RADAR CANVAS DRAWING
function drawRadarGrid() {
    ctx.clearRect(0, 0, radarWidth, radarHeight);
    
    // Draw outer frame
    ctx.beginPath();
    ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw concentric elevation rings (30, 60 degrees)
    const ringRadii = [maxRadius / 3, (2 * maxRadius) / 3, maxRadius];
    const labels = ["60°", "30°", "0°"];
    
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = '9px Orbitron';
    ctx.textAlign = 'center';
    
    ringRadii.forEach((radius, idx) => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Draw labels along the North axis
        ctx.fillText(labels[idx], centerX, centerY - radius + 12);
    });
    
    // Draw Crosshairs
    ctx.beginPath();
    // vertical
    ctx.moveTo(centerX, centerY - maxRadius);
    ctx.lineTo(centerX, centerY + maxRadius);
    // horizontal
    ctx.moveTo(centerX - maxRadius, centerY);
    ctx.lineTo(centerX + maxRadius, centerY);
    ctx.stroke();
    
    // Heading Text Labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px Orbitron';
    ctx.fontWeight = 'bold';
    ctx.fillText("N", centerX, centerY - maxRadius - 6);
    ctx.fillText("S", centerX, centerY + maxRadius + 14);
    ctx.fillText("W", centerX - maxRadius - 10, centerY + 4);
    ctx.fillText("E", centerX + maxRadius + 10, centerY + 4);
}

function drawRadarSatellites() {
    // Redraw background grids first
    drawRadarGrid();
    
    // Draw each satellite
    Object.entries(state.satellites).forEach(([prn, sat]) => {
        const { elevation, azimuth, snr, system, prnVal } = sat;
        
        // Calculate coordinate
        const radius = (1 - (elevation / 90)) * maxRadius;
        
        // Azimuth angle (0 degrees = North = up, clockwise)
        const angleRad = (azimuth - 90) * Math.PI / 180;
        
        const satX = centerX + radius * Math.cos(angleRad);
        const satY = centerY + radius * Math.sin(angleRad);
        
        // Determine Color theme
        let dotColor = '#06b6d4'; // GPS - Cyan
        let shadowColor = 'rgba(6, 182, 212, 0.6)';
        if (system === SYSTEM_GLONASS) {
            dotColor = '#ef4444'; // GLONASS - Red
            shadowColor = 'rgba(239, 68, 68, 0.6)';
        } else if (system === SYSTEM_BEIDOU) {
            dotColor = '#8b5cf6'; // BeiDou - Purple
            shadowColor = 'rgba(139, 92, 246, 0.6)';
        } else if (system === SYSTEM_GALILEO) {
            dotColor = '#eab308'; // Galileo - Yellow
            shadowColor = 'rgba(234, 179, 8, 0.6)';
        } else if (system === SYSTEM_NAVIC) {
            dotColor = '#22c55e'; // NavIC/IRNSS - Green
            shadowColor = 'rgba(34, 197, 94, 0.6)';
        }
        
        // Adjust opacity based on SNR signal strength
        const alpha = Math.min(1.0, Math.max(0.3, snr / 42));
        
        // Draw glow aura
        ctx.beginPath();
        ctx.arc(satX, satY, 11, 0, 2 * Math.PI);
        ctx.fillStyle = shadowColor;
        ctx.globalAlpha = alpha * 0.35;
        ctx.fill();
        
        // Draw inner core circle
        ctx.beginPath();
        ctx.arc(satX, satY, 6, 0, 2 * Math.PI);
        ctx.fillStyle = dotColor;
        ctx.globalAlpha = alpha;
        ctx.fill();
        
        // Reset global alpha
        ctx.globalAlpha = 1.0;
        
        // Draw label (PRN)
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px Fira Code';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(prnVal, satX, satY + 14);
    });
}

// RENDER SNR GRAPH BARS
function renderSnrBars() {
    const activeSats = Object.values(state.satellites);
    
    if (activeSats.length === 0) {
        const waitingHtml = '<div class="no-data-snr">Waiting for GSV data...</div>';
        if (snrBarsContainer.innerHTML !== waitingHtml) {
            snrBarsContainer.innerHTML = waitingHtml;
        }
        return;
    }
    
    // Sort satellites by PRN system name
    activeSats.sort((a, b) => {
        if (a.system !== b.system) {
            return a.system.localeCompare(b.system);
        }
        return parseInt(a.prnVal) - parseInt(b.prnVal);
    });
    
    let barsHtml = "";
    activeSats.forEach(sat => {
        const { prnVal, snr, system } = sat;
        
        // Height scale (SNR 0-50 mapped to 0-100 pixels)
        const barHeight = Math.min(100, Math.max(2, (snr / 50) * 100));
        
        // Color classes
        let colorClass = 'bar-red';
        if (snr > 35) colorClass = 'bar-green';
        else if (snr >= 25) colorClass = 'bar-amber';
        
        // System initial
        const initial = system.charAt(0);
        
        barsHtml += `
            <div class="snr-bar-wrapper">
                <div class="snr-bar-fill ${colorClass}" style="height: ${barHeight}px;" title="PRN: ${prnVal} (${system}) SNR: ${snr} dBHz"></div>
                <div class="snr-bar-label">${prnVal}</div>
                <div class="snr-bar-sublabel">${initial}</div>
            </div>
        `;
    });
    
    if (snrBarsContainer.innerHTML !== barsHtml) {
        snrBarsContainer.innerHTML = barsHtml;
    }
}

// ==========================================
// DEMO / SIMULATION MODE LOGIC
// ==========================================

function startDemoMode() {
    isDemoMode = true;
    demoStep = 0;
    state.connected = true;
    state.vccOk = true;
    lastDataReceivedTime = Date.now();
    
    logTerminalMessage("[DEMO] Starting L89 Simulation Mode...", "system-msg");
    logTerminalMessage("[DEMO] VCC input verified. Serial stream open.", "info-msg");
    
    // Set UI buttons
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    coldStartBtn.disabled = false;
    baudRateSelect.disabled = true;
    
    // Run simulation tick every 1.5 seconds
    demoTimer = setInterval(runDemoTick, 1500);
}

function stopDemoMode() {
    if (demoTimer) {
        clearInterval(demoTimer);
        demoTimer = null;
    }
    isDemoMode = false;
    disconnectDevice();
}

// Generate realistic simulated NMEA sentences
function runDemoTick() {
    demoStep++;
    
    // State machine representing time progression of startup and faults
    if (demoStep <= 3) {
        // Step 1-3: Device connected, searching. Low Satellites in view.
        state.antennaStatus = 'Normal';
        state.antennaMode = 'Auto';
        state.antennaPower = 'Power On';
        
        // Simulate GGA
        feedMockSentence(generateSimulatedGGA(false, 2, "064512.00"));
        // Simulate GSA
        feedMockSentence("$GNGSA,A,1,02,05,,,,,,,,,,,2.5,2.1,1.2*1B");
        // Simulate GSV (Low sats, low SNR)
        feedMockSentence("$GPGSV,1,1,02,02,15,045,18,05,25,180,22*72");
        
    } else if (demoStep <= 8) {
        // Step 4-8: Satellites in view increases. High signals, still acquiring (Cold start sync)
        state.antennaStatus = 'Normal';
        state.antennaMode = 'Auto';
        state.antennaPower = 'Power On';
        
        feedMockSentence(generateSimulatedGGA(false, 6, "064515.00"));
        feedMockSentence("$GNGSA,A,1,02,05,12,24,29,15,,,,,,,,2.1,1.8,1.0*1E");
        feedMockSentence("$GPGSV,2,1,06,02,15,045,36,05,25,180,38,12,45,210,32,24,55,090,39*71");
        feedMockSentence("$GPGSV,2,2,06,29,70,330,41,15,10,310,24*7A");
        feedMockSentence("$GBGSV,1,1,02,08,35,120,33,14,50,060,35*65"); // Add BeiDou
        
    } else if (demoStep <= 14) {
        // Step 9-14: Lock acquired (2D / 3D). Active coordinates show up.
        state.antennaStatus = 'Normal';
        state.antennaMode = 'External';
        state.antennaPower = 'Power On';
        
        const timeStr = (64520 + (demoStep - 8) * 2) + ".00";
        feedMockSentence(generateSimulatedGGA(true, 8, timeStr, 19.0748, 72.8856)); // Mumbai coordinates
        feedMockSentence("$GNGSA,A,3,02,05,12,24,29,15,08,14,,,,,1.2,0.9,0.7*1A"); // 3D Fix indicator
        feedMockSentence("$GPGSV,2,1,06,02,15,045,41,05,25,180,44,12,45,210,39,24,55,090,45*73");
        feedMockSentence("$GPGSV,2,2,06,29,70,330,43,15,12,310,29*76");
        feedMockSentence("$GBGSV,1,1,03,08,35,120,38,14,50,060,40,21,12,220,32*6B");
        feedMockSentence("$PQTMANTENNASTATUS,0,2,1*2C"); // Output antenna status sentence
        
    } else if (demoStep <= 19) {
        // Step 15-19: Simulate Antenna Open Circuit! Average SNR drops, satellites lost.
        state.antennaStatus = 'Open Circuit';
        state.antennaMode = 'Internal';
        state.antennaPower = 'Power On';
        
        feedMockSentence("$PQTMANTENNASTATUS,1,1,1*2E"); // Open circuit, falling back to internal
        
        // GGA with no fix, 0 satellites used
        feedMockSentence(generateSimulatedGGA(false, 0, "064535.00"));
        feedMockSentence("$GNGSA,A,1,,,,,,,,,,,,,9.9,9.9,9.9*1A");
        
        // GSV - Signals dropped heavily due to internal path indoors
        feedMockSentence("$GPGSV,1,1,02,02,15,045,15,05,25,180,12*76");
        
    } else if (demoStep <= 24) {
        // Step 20-24: Recovered antenna, locking back.
        state.antennaStatus = 'Normal';
        state.antennaMode = 'External';
        state.antennaPower = 'Power On';
        
        feedMockSentence("$PQTMANTENNASTATUS,0,2,1*2C");
        feedMockSentence(generateSimulatedGGA(true, 7, "064545.00", 19.0750, 72.8858));
        feedMockSentence("$GNGSA,A,3,02,05,12,24,29,15,08,,,,,,1.3,1.0,0.8*18");
        feedMockSentence("$GPGSV,2,1,06,02,15,045,39,05,25,180,41,12,45,210,38,24,55,090,42*7E");
        feedMockSentence("$GPGSV,2,2,06,29,70,330,40,15,12,310,26*7F");
        
    } else if (demoStep <= 28) {
        // Step 25-28: Simulate CRITICAL Antenna Short Circuit! Power automatically shut off.
        state.antennaStatus = 'Short Circuit';
        state.antennaMode = 'External';
        state.antennaPower = 'Power Off';
        
        feedMockSentence("$PQTMANTENNASTATUS,2,2,0*2F"); // Short circuit alert, Power Off!
        
        // No fix, zero satellites, zero signal
        feedMockSentence(generateSimulatedGGA(false, 0, "064555.00"));
        feedMockSentence("$GNGSA,A,1,,,,,,,,,,,,,9.9,9.9,9.9*1A");
        feedMockSentence("$GPGSV,1,1,00*79"); // Empty satellites in view!
        
    } else {
        // Reset sequence back to locked state
        demoStep = 8;
    }
}

// Push simulated sentences through parsing pipelines
function feedMockSentence(sentence) {
    parseSentence(sentence);
}

// NMEA sentence assembly utilities
function generateSimulatedGGA(fixed, satCount, timeStr, baseLat = 19.076, baseLon = 72.877) {
    // Add tiny randomized drift to coordinates
    const latDrift = (Math.random() - 0.5) * 0.0001;
    const lonDrift = (Math.random() - 0.5) * 0.0001;
    const finalLat = baseLat + latDrift;
    const finalLon = baseLon + lonDrift;
    
    // Latitude formatting: DDMM.MMMMM
    const latDeg = Math.floor(Math.abs(finalLat));
    const latMin = (Math.abs(finalLat) - latDeg) * 60;
    const latStr = `${latDeg.toString().padStart(2, '0')}${latMin.toFixed(4)}`;
    const latDir = finalLat >= 0 ? 'N' : 'S';
    
    // Longitude formatting: DDDMM.MMMMM
    const lonDeg = Math.floor(Math.abs(finalLon));
    const lonMin = (Math.abs(finalLon) - lonDeg) * 60;
    const lonStr = `${lonDeg.toString().padStart(3, '0')}${lonMin.toFixed(4)}`;
    const lonDir = finalLon >= 0 ? 'E' : 'W';
    
    const fixQuality = fixed ? "1" : "0";
    const sats = satCount.toString().padStart(2, '0');
    const hdop = fixed ? "0.9" : "99.9";
    const alt = fixed ? "12.4" : "0.0";
    
    const core = `GNGGA,${timeStr},${latStr},${latDir},${lonStr},${lonDir},${fixQuality},${sats},${hdop},${alt},M,0.0,M,,`;
    
    // Calculate checksum
    let checksum = 0;
    for(let i=0; i < core.length; i++) {
        checksum ^= core.charCodeAt(i);
    }
    const checksumStr = checksum.toString(16).toUpperCase().padStart(2, '0');
    
    return `$${core}*${checksumStr}`;
}

// ==========================================
// DEVICE INFO COMMAND TESTER LOGIC
// ==========================================

function handleJsonMessage(sentence) {
    displayRXPayload(sentence);
    try {
        const obj = JSON.parse(sentence);
        if (obj) {
            // Check profile mismatches
            if (activeProfile === 'sbi' && sbiUnlockState !== 'unlocked') {
                if ((obj.data && obj.data.serial_number) || obj.serial_number) {
                    logToCmdConsole("HARDWARE WARNING: Received plaintext JSON. This device is in BOB Mode! Please switch the profile to BOB or convert the device to SBI mode.", "fail");
                    sbiUnlockState = 'failed';
                }
            }

            // Check if there's a command field or try to infer command from data fields
            let cmd = obj.command;
            if (!cmd) {
                if (obj.data) {
                    if (obj.data.serial_number !== undefined) cmd = 'get_device_info';
                    else if (obj.data.latitude !== undefined) cmd = 'get_location';
                } else {
                    if (obj.serial_number !== undefined) cmd = 'get_device_info';
                    else if (obj.latitude !== undefined) cmd = 'get_location';
                }
                
                // Parse encryption/decryption messages from status strings
                if (obj.message && obj.message.toLowerCase().includes("disabled") && obj.message.toLowerCase().includes("encryption")) {
                    cmd = 'disable_encryption';
                } else if (obj.message && obj.message.toLowerCase().includes("enabled") && obj.message.toLowerCase().includes("encryption")) {
                    cmd = 'enable_encryption';
                } else if (obj.status === 'success' && obj.message && obj.message.toLowerCase().includes("encryption")) {
                    if (obj.message.toLowerCase().includes("disabled")) {
                        cmd = 'disable_encryption';
                    } else {
                        cmd = 'enable_encryption';
                    }
                } else if (obj.message && obj.message.toLowerCase().includes("location")) {
                    cmd = 'get_location';
                } else if (activeQueries['get_location']) {
                    cmd = 'get_location';
                } else if (activeQueries['get_device_info']) {
                    cmd = 'get_device_info';
                }
            }
            
            // Check for SBI unlock state change
            if (cmd === 'disable_encryption') {
                if (sbiUnlockState === 'unlocking_sent_disable') {
                    sbiUnlockState = 'unlocked';
                    logToCmdConsole("SBI device unlocked successfully (BOB mode temporarily active).", "pass");
                }
            }
            
            // Resolve the query if active
            if (cmd && activeQueries[cmd]) {
                activeQueries[cmd](obj);
                activeQueries[cmd] = null;
            }
            
            // Extract BOB device data if it's successfully returned
            if (cmd === 'get_device_info' && obj.status === 'success' && obj.data) {
                const serialVal = obj.data.serial_number || '--';
                const firmVal = obj.data.firmware_version || '--';
                const batVal = obj.data.battery_voltage || '3.95V';
                
                const serialEl = document.getElementById('cmdDeviceSerial');
                const firmEl = document.getElementById('cmdDeviceFirmware');
                const batEl = document.getElementById('cmdDeviceBattery');
                
                if (serialEl) serialEl.textContent = serialVal;
                if (firmEl) firmEl.textContent = firmVal;
                if (batEl) batEl.textContent = batVal;
            }
            
            if (cmd === 'get_location' && obj.status === 'success' && obj.data) {
                const lat = parseFloat(obj.data.latitude) || 0;
                const lon = parseFloat(obj.data.longitude) || 0;
                const acc = parseFloat(obj.data.accuracy) || 0;
                
                const locEl = document.getElementById('cmdDeviceLocation');
                if (locEl) locEl.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
                
                // Update global tracking state so maps and radars update too!
                state.latitude = lat;
                state.longitude = lon;
                state.hdop = acc;
                state.fixOk = (lat !== 0 && lon !== 0);
                state.fixType = state.fixOk ? "3D Fix" : "No Fix";
            }
        }
    } catch (e) {
        console.error("Failed to parse incoming JSON message:", e);
        logTerminalMessage(`[RAW] ${sentence}`, 'system-msg');
    }
}

function sendJsonCommand(commandName) {
    return new Promise((resolve, reject) => {
        // Setup timeout
        const timeoutId = setTimeout(() => {
            activeQueries[commandName] = null;
            reject(new Error(`Timeout: No response received for ${commandName} within 3 seconds.`));
        }, 3000);
        
        activeQueries[commandName] = (response) => {
            clearTimeout(timeoutId);
            resolve(response);
        };
        
        // Construct and send command
        const cmdStr = JSON.stringify({ command: commandName }) + "\r\n";
        displayTXPayload(cmdStr.trim());
        logTerminalMessage(`[COMMAND] Sending: ${commandName}`, 'warning-msg');
        
        if (isDemoMode) {
            // Emulate response in simulator mode
            setTimeout(() => {
                let mockResponse;
                if (commandName === 'get_device_info') {
                    mockResponse = {
                        status: "success",
                        command: "get_device_info",
                        data: {
                            serial_number: "000028562FC0F8D4",
                            firmware_version: "1.8.7",
                            make: "RAIVENS",
                            device_status: "active",
                            battery_voltage: "3.95V",
                            signal_strength: "85%"
                        }
                    };
                } else if (commandName === 'get_location') {
                    mockResponse = {
                        status: "success",
                        command: "get_location",
                        data: {
                            latitude: "26.776066",
                            longitude: "75.839216",
                            accuracy: "1.17"
                        }
                    };
                } else if (commandName === 'disable_encryption') {
                    mockResponse = {
                        status: "success",
                        command: "disable_encryption",
                        message: "Encryption disabled and saved"
                    };
                } else if (commandName === 'enable_encryption') {
                    mockResponse = {
                        status: "success",
                        command: "enable_encryption",
                        message: "Encryption enabled and saved"
                    };
                }
                
                if (activeQueries[commandName]) {
                    handleJsonMessage(JSON.stringify(mockResponse));
                }
            }, 600);
            return;
        }
        
        if (!writer) {
            clearTimeout(timeoutId);
            activeQueries[commandName] = null;
            reject(new Error("Serial port not connected."));
            return;
        }
        
        writeSerial(cmdStr).catch(err => {
            clearTimeout(timeoutId);
            activeQueries[commandName] = null;
            reject(err);
        });
    });
}

function sendSbiRawCommand() {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            activeQueries['sbi_handshake'] = null;
            reject(new Error("Timeout: No response received for SBI command within 3 seconds."));
        }, 3000);
        
        activeQueries['sbi_handshake'] = (response) => {
            clearTimeout(timeoutId);
            resolve(response);
        };
        
        displayTXPayload(SBI_UNLOCK_KEY.trim());
        logTerminalMessage(`[COMMAND] Sending SBI key...`, 'warning-msg');
        
        if (isDemoMode) {
            setTimeout(() => {
                if (activeQueries['sbi_handshake']) {
                    const mockResponse = "ID0BMDQD5CpCxCtCmByBsB6C4CHD1C9C0BDC6BHDaCvCtCnChCxC1BACzBPC5CMD4CIDDDZCaBECZCJCaCzBsCED4C4C1CND4BJDnCaBfC0CdCADQD2CJDvC6CED1BJDDDoCpCbC6CdC0C1BwBzBrC5C3CLDVDKDpChCeCmByBCDJD7C4CFD";
                    displayRXPayload(mockResponse);
                    const resolveCallback = activeQueries['sbi_handshake'];
                    activeQueries['sbi_handshake'] = null;
                    resolveCallback(mockResponse);
                }
            }, 800);
            return;
        }
        
        if (!writer) {
            clearTimeout(timeoutId);
            activeQueries['sbi_handshake'] = null;
            reject(new Error("Serial port not connected."));
            return;
        }
        
        writeSerial(SBI_UNLOCK_KEY).catch(err => {
            clearTimeout(timeoutId);
            activeQueries['sbi_handshake'] = null;
            reject(err);
        });
    });
}

async function runDeviceTest() {
    if (cmdRunTestBtn) cmdRunTestBtn.disabled = true;
    
    if (cmdInstructionsCard) cmdInstructionsCard.style.display = 'none';
    if (cmdResultsCard) cmdResultsCard.style.display = 'none';
    if (cmdTestLoader) cmdTestLoader.style.display = 'block';
    
    // Clear terminal log for this test run
    if (cmdLogTerminal) {
        cmdLogTerminal.innerHTML = "";
    }
    
    logToCmdConsole("Console cleared. Ready ...", "info");
    
    // Mimic the Vercel page loader timing
    await new Promise(resolve => setTimeout(resolve, 300));

    if (activeProfile === 'sbi') {
        logToCmdConsole("Test Step: Querying SBI Secure Handshake Command (Acquiring signature response...)", "info");
        try {
            const resSbi = await sendSbiRawCommand();
            
            if (resSbi && resSbi.isBobDeviceError) {
                throw new Error("This is a BOB device! Please switch the profile to BOB or convert the device to SBI mode first using the bottom conversion utility.");
            }
            
            const resSerial = document.getElementById('resSerial');
            const resFirmware = document.getElementById('resFirmware');
            const resMake = document.getElementById('resMake');
            const resBattery = document.getElementById('resBattery');
            
            if (resSerial) resSerial.textContent = 'N/A';
            if (resFirmware) resFirmware.textContent = 'N/A';
            if (resMake) resMake.textContent = 'SBI Encrypted';
            if (resBattery) resBattery.textContent = 'N/A';
            
            logToCmdConsole(`PASS: SBI secure handshake response received successfully.`, 'pass');
            
            const resBadge = document.getElementById('resBadge');
            if (resBadge) {
                resBadge.textContent = "SUCCESS";
                resBadge.className = "badge response-badge success";
            }
            const resMessage = document.getElementById('resMessage');
            if (resMessage) {
                resMessage.textContent = "SBI handshake response received: " + resSbi.substring(0, 30) + "...";
                resMessage.style.color = "#4ade80";
            }
        } catch (err) {
            console.error("SBI Test failed:", err);
            
            const resSerial = document.getElementById('resSerial');
            const resFirmware = document.getElementById('resFirmware');
            const resMake = document.getElementById('resMake');
            const resBattery = document.getElementById('resBattery');
            
            if (resSerial) resSerial.textContent = '--';
            if (resFirmware) resFirmware.textContent = '--';
            if (resMake) resMake.textContent = '--';
            if (resBattery) resBattery.textContent = '--';
            
            const resBadge = document.getElementById('resBadge');
            if (resBadge) {
                resBadge.textContent = "FAIL";
                resBadge.className = "badge response-badge error";
            }
            const resMessage = document.getElementById('resMessage');
            if (resMessage) {
                resMessage.textContent = err.message || "SBI Handshake Failed";
                resMessage.style.color = "#f87171";
            }
            logToCmdConsole(`FAIL: ${err.message}`, 'fail');
        } finally {
            if (cmdTestLoader) cmdTestLoader.style.display = 'none';
            if (cmdResultsCard) cmdResultsCard.style.display = 'block';
            if (cmdRunTestBtn) cmdRunTestBtn.disabled = false;
        }
        return;
    }

    // BOB Profile (JSON-based commands)
    logToCmdConsole("Test Step 1: Info (Querying hardware device info...)", "info");
    
    try {
        const resInfo = await sendJsonCommand('get_device_info');
        
        if (resInfo && resInfo.status === 'success') {
            const data = resInfo.data || {};
            const serialVal = data.serial_number || '--';
            const firmVal = data.firmware_version || '--';
            const makeVal = data.make || 'RAIVENS';
            const batVal = data.battery_voltage || '3.95V';
            
            const resSerial = document.getElementById('resSerial');
            const resFirmware = document.getElementById('resFirmware');
            const resMake = document.getElementById('resMake');
            const resBattery = document.getElementById('resBattery');
            
            if (resSerial) resSerial.textContent = serialVal;
            if (resFirmware) resFirmware.textContent = firmVal;
            if (resMake) resMake.textContent = makeVal;
            if (resBattery) resBattery.textContent = batVal;
            
            logToCmdConsole(`PASS: Device Info retrieved successfully (Serial: ${serialVal}, Firmware: ${firmVal}).`, 'pass');
            
            // Proceed to Step 2: Location Query
            await new Promise(resolve => setTimeout(resolve, 500));
            logToCmdConsole("Test Step 2: GPS Location Query (Acquiring coordinates...)", "info");
            
            const resLoc = await sendJsonCommand('get_location');
            if (resLoc && resLoc.status === 'success') {
                const locData = resLoc.data || {};
                const latVal = parseFloat(locData.latitude) || 0;
                const lonVal = parseFloat(locData.longitude) || 0;
                const accVal = parseFloat(locData.accuracy) || 0;
                
                logToCmdConsole(`PASS: Location check completed (Latitude: ${latVal}, Longitude: ${lonVal}, Accuracy: ${accVal}m).`, 'pass');
                
                const resBadge = document.getElementById('resBadge');
                if (resBadge) {
                    resBadge.textContent = "SUCCESS";
                    resBadge.className = "badge response-badge success";
                }
                const resMessage = document.getElementById('resMessage');
                if (resMessage) {
                    resMessage.textContent = "All test cases passed successfully";
                    resMessage.style.color = "#4ade80";
                }
            } else if (resLoc && (resLoc.status === 'error' || resLoc.status === 'fail' || !resLoc.status) && resLoc.message && resLoc.message.toLowerCase().includes("location not valid")) {
                // Handle device responding but has no GPS lock yet
                logToCmdConsole(`PASS: Location check command succeeded, but GPS is not locked yet (${resLoc.message}).`, 'pass');
                
                const resBadge = document.getElementById('resBadge');
                if (resBadge) {
                    resBadge.textContent = "SUCCESS";
                    resBadge.className = "badge response-badge success";
                }
                const resMessage = document.getElementById('resMessage');
                if (resMessage) {
                    resMessage.textContent = "Command communication OK, GPS not locked yet";
                    resMessage.style.color = "#fb923c"; // orange/amber
                }
            } else {
                throw new Error("Failed to query device GPS location coordinates.");
            }
        } else {
            throw new Error("Invalid response format or status field on device info query.");
        }
    } catch (err) {
        console.error("Test failed:", err);
        
        const resSerial = document.getElementById('resSerial');
        const resFirmware = document.getElementById('resFirmware');
        const resMake = document.getElementById('resMake');
        const resBattery = document.getElementById('resBattery');
        
        if (resSerial) resSerial.textContent = '--';
        if (resFirmware) resFirmware.textContent = '--';
        if (resMake) resMake.textContent = '--';
        if (resBattery) resBattery.textContent = '--';
        
        const resBadge = document.getElementById('resBadge');
        if (resBadge) {
            resBadge.textContent = "FAIL";
            resBadge.className = "badge response-badge error";
        }
        const resMessage = document.getElementById('resMessage');
        if (resMessage) {
            resMessage.textContent = err.message || "Test Execution Failed";
            resMessage.style.color = "#f87171";
        }
        
        logToCmdConsole(`FAIL: ${err.message}`, 'fail');
    } finally {
        if (cmdTestLoader) cmdTestLoader.style.display = 'none';
        if (cmdResultsCard) cmdResultsCard.style.display = 'block';
        if (cmdRunTestBtn) cmdRunTestBtn.disabled = false;
    }
}

// Convert Device to BOB Mode (Permanently disabling encryption)
async function convertDeviceToBob() {
    if (isDemoMode) {
        toggleConversionUI(true, "Unlocking device...", "info");
        setTimeout(() => {
            toggleConversionUI(true, "Converting to BOB (Disabling Encryption)...", "info");
            setTimeout(() => {
                toggleConversionUI(false, "Conversion to BOB Complete! Device is now in BOB mode.", "pass");
                activeProfile = 'bob';
                if (profileBobBtn) profileBobBtn.click();
            }, 2500);
        }, 1500);
        return;
    }

    if (!writer) return;

    try {
        toggleConversionUI(true, "Unlocking device...", "info");
        logTerminalMessage("[SYSTEM] Sending BOB conversion unlock key...", "warning-msg");
        displayTXPayload(BOB_CONVERSION_KEY.trim());
        await writeSerial(BOB_CONVERSION_KEY);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        toggleConversionUI(true, "Converting to BOB (Disabling Encryption)...", "info");
        
        const res = await sendJsonCommand('disable_encryption');
        if (res && (res.status === 'success' || (res.message && res.message.toLowerCase().includes('disabled')))) {
            toggleConversionUI(false, "Conversion to BOB Complete! Device is now in BOB mode.", "pass");
            activeProfile = 'bob';
            if (profileBobBtn) profileBobBtn.click();
        } else {
            throw new Error("Device returned failure status on disabling encryption.");
        }
    } catch (err) {
        console.error("Conversion to BOB failed:", err);
        toggleConversionUI(false, "Conversion Failed: " + err.message, "fail");
    }
}

// Convert Device to SBI Mode (Permanently enabling encryption)
async function convertDeviceToSbi() {
    if (isDemoMode) {
        toggleConversionUI(true, "Converting to SBI (Enabling Encryption)...", "info");
        setTimeout(() => {
            toggleConversionUI(false, "Conversion to SBI Complete! Device is now in SBI mode.", "pass");
            activeProfile = 'sbi';
            if (profileSbiBtn) profileSbiBtn.click();
        }, 3000);
        return;
    }

    if (!writer) return;

    try {
        toggleConversionUI(true, "Converting to SBI (Enabling Encryption)...", "info");
        
        const res = await sendJsonCommand('enable_encryption');
        if (res && (res.status === 'success' || (res.message && res.message.toLowerCase().includes('enabled')))) {
            toggleConversionUI(false, "Conversion to SBI Complete! Device is now in SBI mode.", "pass");
            activeProfile = 'sbi';
            if (profileSbiBtn) profileSbiBtn.click();
        } else {
            throw new Error("Device returned failure status on enabling encryption.");
        }
    } catch (err) {
        console.error("Conversion to SBI failed:", err);
        toggleConversionUI(false, "Conversion Failed: " + err.message, "fail");
    }
}

// Helper to update conversion status alert
function toggleConversionUI(running, message, type) {
    if (!conversionStatusBox) return;
    
    if (running) {
        if (convertBobBtn) convertBobBtn.disabled = true;
        if (convertSbiBtn) convertSbiBtn.disabled = true;
        if (cmdRunTestBtn) cmdRunTestBtn.disabled = true;
        if (cmdDisconnectBtn) cmdDisconnectBtn.disabled = true;
        
        conversionStatusBox.style.display = 'block';
        conversionStatusBox.textContent = message;
        conversionStatusBox.style.background = 'rgba(59, 130, 246, 0.1)';
        conversionStatusBox.style.border = '1px solid rgba(59, 130, 246, 0.2)';
        conversionStatusBox.style.color = '#93c5fd';
        logToCmdConsole(message, "info");
    } else {
        if (convertBobBtn) convertBobBtn.disabled = false;
        if (convertSbiBtn) convertSbiBtn.disabled = false;
        if (cmdRunTestBtn) cmdRunTestBtn.disabled = false;
        if (cmdDisconnectBtn) cmdDisconnectBtn.disabled = false;
        
        conversionStatusBox.style.display = 'block';
        conversionStatusBox.textContent = message;
        
        if (type === 'pass') {
            conversionStatusBox.style.background = 'rgba(16, 185, 129, 0.1)';
            conversionStatusBox.style.border = '1px solid rgba(16, 185, 129, 0.2)';
            conversionStatusBox.style.color = '#34d399';
            logToCmdConsole(message, "pass");
        } else {
            conversionStatusBox.style.background = 'rgba(239, 68, 68, 0.1)';
            conversionStatusBox.style.border = '1px solid rgba(239, 68, 68, 0.2)';
            conversionStatusBox.style.color = '#f87171';
            logToCmdConsole(message, "fail");
        }
        
        // Hide after 6 seconds
        setTimeout(() => {
            if (conversionStatusBox.textContent === message) {
                conversionStatusBox.style.display = 'none';
            }
        }, 6000);
    }
}

function logToCmdConsole(message, type = 'info') {
    const consoleLog = document.getElementById('cmdLogTerminal');
    if (!consoleLog) return;
    
    // Vercel app-style timestamp: [10:53:47 am]
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
    const line = document.createElement('div');
    line.style.marginBottom = '0.35rem';
    line.style.borderBottom = '1px solid rgba(255, 255, 255, 0.02)';
    line.style.paddingBottom = '0.2rem';
    
    let color = '#f1f5f9'; // default white
    let prefix = `[${time}] `;
    
    if (type === 'tx') {
        color = '#fb923c'; // orange
        prefix += `>> SENT: `;
    } else if (type === 'rx') {
        color = '#4ade80'; // light green
        prefix += `<< RECV: `;
    } else if (type === 'pass') {
        color = '#10b981'; // emerald green
        prefix += `++ RESULT: `;
        line.style.textShadow = '0 0 8px rgba(16, 185, 129, 0.4)';
        line.style.fontWeight = 'bold';
    } else if (type === 'fail') {
        color = '#f87171'; // light red
        prefix += `!! ERROR: `;
        line.style.textShadow = '0 0 8px rgba(239, 68, 68, 0.4)';
        line.style.fontWeight = 'bold';
    } else if (type === 'info') {
        color = '#38bdf8'; // light blue
        prefix += `[INFO] `;
    }
    
    line.style.color = color;
    let formattedMessage = message;
    if (message.startsWith('{') || message.startsWith('[')) {
        try {
            const parsed = JSON.parse(message);
            formattedMessage = JSON.stringify(parsed);
        } catch {}
    }
    
    line.innerHTML = `<span style="opacity: 0.5; color: #94a3b8; font-family: 'Orbitron', sans-serif; font-size: 0.72rem;">${prefix}</span><span>${formattedMessage}</span>`;
    
    consoleLog.appendChild(line);
    consoleLog.scrollTop = consoleLog.scrollHeight;
}

function displayTXPayload(rawStr) {
    logToCmdConsole(rawStr, 'tx');
}

function displayRXPayload(rawStr) {
    logToCmdConsole(rawStr, 'rx');
}

async function sendGpsForwardingCommand(enable) {
    if (isDemoMode) {
        logTerminalMessage(`[DEMO] Simulating GPS forwarding ${enable ? 'STARTED' : 'STOPPED'}.`, "system-msg");
        return;
    }
    if (!writer) return;
    try {
        const cmdName = enable ? "get_raw_gps_data" : "stop_raw_gps_data";
        const cmd = JSON.stringify({ command: cmdName }) + "\r\n";
        await writeSerial(cmd);
        logTerminalMessage(`[SYSTEM] Sent mode command: ${cmd.trim()}`, "system-msg");
    } catch (err) {
        console.error("Failed to send mode command:", err);
        logTerminalMessage(`[SYSTEM] Failed to send mode command: ${err.message}`, "error-msg");
    }
}

// ============================================================================
// AUTHENTICATION & SESSION TRACKING LOGIC
// ============================================================================

// Login Portal DOM Elements
const loginOverlay = document.getElementById('loginOverlay');
const loginStepEmail = document.getElementById('loginStepEmail');
const loginStepOtp = document.getElementById('loginStepOtp');
const loginEmail = document.getElementById('loginEmail');
const loginOtp = document.getElementById('loginOtp');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const backToEmailBtn = document.getElementById('backToEmailBtn');
const loginStatus = document.getElementById('loginStatus');
const loginStatusTitle = document.getElementById('loginStatusTitle');
const loginStatusDesc = document.getElementById('loginStatusDesc');
const logoutBtn = document.getElementById('logoutBtn');

let heartbeatInterval = null;
let currentEmail = null;
let currentToken = null;

function showLoginStatus(title, message, type = 'info') {
    loginStatus.style.display = 'block';
    loginStatusTitle.textContent = title;
    loginStatusDesc.textContent = message;
    
    // Reset classes and custom style borders
    loginStatus.className = 'alert-box';
    if (type === 'success') {
        loginStatus.classList.add('alert-info');
        loginStatus.style.borderColor = 'var(--success)';
        loginStatus.style.background = 'rgba(16, 185, 129, 0.05)';
        loginStatus.style.color = '#34d399';
    } else if (type === 'error') {
        loginStatus.classList.add('alert-danger');
        loginStatus.style.borderColor = 'var(--danger)';
        loginStatus.style.background = 'rgba(239, 68, 68, 0.05)';
        loginStatus.style.color = '#f87171';
    } else {
        loginStatus.classList.add('alert-info');
        loginStatus.style.borderColor = 'var(--primary)';
        loginStatus.style.background = 'rgba(6, 182, 212, 0.05)';
        loginStatus.style.color = '#67e8f9';
    }
}

async function handleSendOtp() {
    const email = loginEmail.value.trim();
    if (!email || !email.includes('@')) {
        showLoginStatus('Error', 'Please enter a valid email address.', 'error');
        return;
    }
    
    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = 'Logging in...';
    showLoginStatus('Please Wait', 'Unlocking diagnostic portal...', 'info');
    
    try {
        const response = await fetch('/api/login-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (data.success) {
            currentToken = data.token;
            currentEmail = data.email;
            localStorage.setItem('diag_token', data.token);
            localStorage.setItem('diag_email', data.email);
            
            loginOverlay.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'inline-flex';
            
            startHeartbeat(data.token);
            showLoginStatus('Unlocked', 'Access granted!', 'success');
        } else {
            showLoginStatus('Error', data.message || 'Login failed. Please try again.', 'error');
            sendOtpBtn.disabled = false;
            sendOtpBtn.textContent = 'Login & Unlock Portal';
        }
    } catch (err) {
        showLoginStatus('Connection Error', 'Could not reach the local server. Is it running?', 'error');
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = 'Login & Unlock Portal';
    }
}

function startHeartbeat(token) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    sendHeartbeat(token);
    heartbeatInterval = setInterval(() => {
        sendHeartbeat(token);
    }, 5000);
}

async function sendHeartbeat(token) {
    try {
        const response = await fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await response.json();
        if (!data.success) {
            handleLogout();
        }
    } catch (err) {
        console.error('Heartbeat connection error:', err);
    }
}

async function handleLogout() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    const token = localStorage.getItem('diag_token');
    if (token) {
        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
        } catch (err) {
            console.error('Error logging out from server:', err);
        }
    }
    
    localStorage.removeItem('diag_token');
    localStorage.removeItem('diag_email');
    
    currentToken = null;
    currentEmail = null;
    
    loginEmail.value = '';
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = 'Login & Unlock Portal';
    loginStatus.style.display = 'none';
    
    loginStepEmail.style.display = 'block';
    
    loginOverlay.style.display = 'flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
}

function checkAuthentication() {
    const token = localStorage.getItem('diag_token');
    const email = localStorage.getItem('diag_email');
    
    if (token && email) {
        currentToken = token;
        currentEmail = email;
        loginOverlay.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';
        startHeartbeat(token);
    } else {
        loginOverlay.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

