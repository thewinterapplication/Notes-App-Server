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
    }

    /**
     * Send OTP to a phone number using 2Factor Voice AUTOGEN
     * @param phoneNumber - Phone number with country code (e.g., 91XXXXXXXXXX for India)
     * @returns Session ID for OTP verification
     */
    async sendOTP(phoneNumber: string): Promise<SendOTPResult> {
        if (!this.apiKey) {
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

        try {
            // Using VOICE instead of SMS for voice call OTP
            const url = `${this.baseUrl}/${this.apiKey}/VOICE/${cleanPhone}/AUTOGEN`;

            const response = await fetch(url);
            const data: OTPResponse = await response.json();

            if (data.Status === "Success") {
                return {
                    success: true,
                    sessionId: data.Details,
                    message: "Voice OTP call initiated successfully"
                };
            } else {
                return {
                    success: false,
                    message: data.Details || "Failed to send Voice OTP"
                };
            }
        } catch (error: any) {
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
        if (!this.apiKey) {
            return {
                success: false,
                message: "OTP service not configured. Please set TWOFACTOR_API_KEY."
            };
        }

        try {
            // Using VOICE/VERIFY for voice OTP verification
            const url = `${this.baseUrl}/${this.apiKey}/VOICE/VERIFY/${sessionId}/${otp}`;

            const response = await fetch(url);
            const data: OTPResponse = await response.json();

            if (data.Status === "Success" && data.Details === "OTP Matched") {
                return {
                    success: true,
                    message: "OTP verified successfully"
                };
            } else {
                return {
                    success: false,
                    message: data.Details || "Invalid OTP"
                };
            }
        } catch (error: any) {
            return {
                success: false,
                message: error.message || "Failed to verify OTP"
            };
        }
    }
}
