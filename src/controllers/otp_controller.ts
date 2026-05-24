import { Elysia, t } from "elysia";
import { OTPService } from "../services/otp_service";
import { UserModel, normalizeUserSubscription } from "../models/User";
import { generateSessionToken } from "../utils/user_auth";

export const otpController = new Elysia({ prefix: "/otp" })
    .decorate('otpService', new OTPService())

    // Send OTP to phone number
    .post("/send", async ({ body, otpService }) => {
        const { phoneNumber } = body;
        const result = await otpService.sendOTP(phoneNumber);

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

    // Verify OTP — on success, establish a single active session for this number.
    // Any device previously logged in with this number is logged out, because
    // we overwrite the user's activeSessionId (its old token stops matching).
    .post("/verify", async ({ body, otpService }) => {
        const { sessionId, otp, deviceId } = body;
        const result = await otpService.verifyOTP(sessionId, otp);

        if (!result.success || !result.phone) {
            return {
                success: result.success,
                message: result.message
            };
        }

        const user = await UserModel.findOne({ phone: result.phone });

        // No account yet — verified, but the app should route to registration.
        if (!user) {
            return {
                success: true,
                registered: false,
                message: "OTP verified. Please complete registration."
            };
        }

        const token = generateSessionToken();
        user.activeSessionId = token;
        user.activeDeviceId = deviceId ?? null;
        user.sessionUpdatedAt = new Date();
        await user.save();

        return {
            success: true,
            registered: true,
            message: "OTP verified successfully",
            sessionId: token,
            data: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                favourites: user.favourites,
                lastTransaction: user.lastTransaction,
                createdAt: user.createdAt,
                subscription: normalizeUserSubscription(user.subscription)
            }
        };
    }, {
        body: t.Object({
            sessionId: t.String(),
            otp: t.String({ minLength: 4, maxLength: 4 }),
            deviceId: t.Optional(t.String())
        })
    });
