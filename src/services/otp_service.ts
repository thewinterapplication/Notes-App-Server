import { config } from "../config";

interface OTPResponse {
    Status: string;
    Details: string;
}

interface SendOTPResult {
    success: boolean;
    sessionId?: string;
    message: string;
}

interface VerifyOTPResult {
    success: boolean;
    message: string;
}

export class OTPService {
    private apiKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = config.otp.apiKey;
        this.baseUrl = config.otp.baseUrl;

        console.log("[OTPService] Initialized");
        console.log("[OTPService] API Key configured:", this.apiKey ? "YES" : "NO");

        if (!this.apiKey) {
            console.warn("[OTPService] Warning: TWOFACTOR_API_KEY is not set in environment variables");
        }
    }

    /**
     * Send OTP to a phone number using 2Factor Voice AUTOGEN
     * @param phoneNumber - Phone number with country code (e.g., 91XXXXXXXXXX for India)
     * @returns Session ID for OTP verification
     */
    async sendOTP(phoneNumber: string): Promise<SendOTPResult> {
        console.log("[OTPService] sendOTP (VOICE) called with phone:", phoneNumber);

        if (!this.apiKey) {
            console.error("[OTPService] API key not configured");
            return {
                success: false,
                message: "OTP service not configured. Please set TWOFACTOR_API_KEY."
            };
        }

        // Clean phone number - remove spaces, dashes, and country code
        let cleanPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, "");

        // Remove 91 prefix if present (Voice API expects 10 digit number)
        if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
            cleanPhone = cleanPhone.substring(2);
        }
        console.log("[OTPService] Cleaned phone number:", cleanPhone);

        try {
            // Using VOICE instead of SMS for voice call OTP
            const url = `${this.baseUrl}/${this.apiKey}/VOICE/${cleanPhone}/AUTOGEN`;
            console.log("[OTPService] Calling 2Factor VOICE API...");

            const response = await fetch(url);
            const data: OTPResponse = await response.json();

            console.log("[OTPService] 2Factor VOICE API response:", JSON.stringify(data));

            if (data.Status === "Success") {
                console.log("[OTPService] Voice OTP sent successfully, sessionId:", data.Details);
                return {
                    success: true,
                    sessionId: data.Details,
                    message: "Voice OTP call initiated successfully"
                };
            } else {
                console.error("[OTPService] Failed to send Voice OTP:", data.Details);
                return {
                    success: false,
                    message: data.Details || "Failed to send Voice OTP"
                };
            }
        } catch (error: any) {
            console.error("[OTPService] Exception while sending Voice OTP:", error);
            return {
                success: false,
                message: error.message || "Failed to send Voice OTP"
            };
        }
    }

    /**
     * Verify OTP entered by user
     * @param sessionId - Session ID received when OTP was sent
     * @param otp - OTP entered by user
     * @returns Verification result
     */
    async verifyOTP(sessionId: string, otp: string): Promise<VerifyOTPResult> {
        console.log("[OTPService] verifyOTP called with sessionId:", sessionId, "otp:", otp);

        if (!this.apiKey) {
            console.error("[OTPService] API key not configured");
            return {
                success: false,
                message: "OTP service not configured. Please set TWOFACTOR_API_KEY."
            };
        }

        try {
            // Using VOICE/VERIFY for voice OTP verification
            const url = `${this.baseUrl}/${this.apiKey}/VOICE/VERIFY/${sessionId}/${otp}`;
            console.log("[OTPService] Calling 2Factor VOICE verify API...");

            const response = await fetch(url);
            const data: OTPResponse = await response.json();

            console.log("[OTPService] 2Factor verify response:", JSON.stringify(data));

            if (data.Status === "Success" && data.Details === "OTP Matched") {
                console.log("[OTPService] OTP verified successfully");
                return {
                    success: true,
                    message: "OTP verified successfully"
                };
            } else {
                console.error("[OTPService] OTP verification failed:", data.Details);
                return {
                    success: false,
                    message: data.Details || "Invalid OTP"
                };
            }
        } catch (error: any) {
            console.error("[OTPService] Exception while verifying OTP:", error);
            return {
                success: false,
                message: error.message || "Failed to verify OTP"
            };
        }
    }
}
