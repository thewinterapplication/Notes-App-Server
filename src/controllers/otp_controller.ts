import { Elysia, t } from "elysia";
import { OTPService } from "../services/otp_service";

export const otpController = new Elysia({ prefix: "/otp" })
    .decorate('otpService', new OTPService())

    // Send OTP to phone number
    .post("/send", async ({ body, otpService }) => {
        console.log("[OTP Controller] POST /otp/send - Request received");
        console.log("[OTP Controller] Request body:", JSON.stringify(body));

        const { phoneNumber } = body;

        const result = await otpService.sendOTP(phoneNumber);

        console.log("[OTP Controller] sendOTP result:", JSON.stringify(result));

        if (result.success) {
            return {
                success: true,
                sessionId: result.sessionId,
                message: result.message
            };
        } else {
            return {
                success: false,
                message: result.message
            };
        }
    }, {
        body: t.Object({
            phoneNumber: t.String({ minLength: 10 })
        })
    })

    // Verify OTP
    .post("/verify", async ({ body, otpService }) => {
        console.log("[OTP Controller] POST /otp/verify - Request received");
        console.log("[OTP Controller] Request body:", JSON.stringify(body));

        const { sessionId, otp } = body;

        const result = await otpService.verifyOTP(sessionId, otp);

        console.log("[OTP Controller] verifyOTP result:", JSON.stringify(result));

        return {
            success: result.success,
            message: result.message
        };
    }, {
        body: t.Object({
            sessionId: t.String(),
            otp: t.String({ minLength: 4, maxLength: 4 })
        })
    });
