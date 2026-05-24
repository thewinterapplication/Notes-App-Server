import { Elysia, t } from "elysia";
import { IUser, normalizeUserSubscription, UserModel } from "../models/User";
import { authenticateUser, generateSessionToken } from "../utils/user_auth";

const serializeUser = (user: IUser) => ({
    id: user._id,
    name: user.name,
    phone: user.phone,
    favourites: user.favourites,
    lastTransaction: user.lastTransaction,
    createdAt: user.createdAt,
    subscription: normalizeUserSubscription(user.subscription)
});

export const userController = new Elysia({ prefix: "/api" })

    // Register new user — also establishes the single active session.
    .post("/register", async ({ body }) => {
        const { name, phone, deviceId } = body;

        try {
            const existingUser = await UserModel.findOne({ phone });

            if (existingUser) {
                return {
                    success: false,
                    message: "User with this phone number already exists"
                };
            }

            const token = generateSessionToken();
            const newUser = new UserModel({
                name,
                phone,
                favourites: [],
                activeSessionId: token,
                activeDeviceId: deviceId ?? null,
                sessionUpdatedAt: new Date()
            });

            await newUser.save();

            return {
                success: true,
                message: "Registration successful",
                sessionId: token,
                data: serializeUser(newUser)
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || "Registration failed"
            };
        }
    }, {
        body: t.Object({
            name: t.String({ minLength: 1 }),
            phone: t.String({ minLength: 10 }),
            deviceId: t.Optional(t.String())
        })
    })

    // Login user — overwrites any existing session, logging out the old device.
    .post("/login", async ({ body }) => {
        const { phone, deviceId } = body;

        try {
            const user = await UserModel.findOne({ phone });

            if (!user) {
                return {
                    success: false,
                    message: "User not found. Please register first."
                };
            }

            const token = generateSessionToken();
            user.activeSessionId = token;
            user.activeDeviceId = deviceId ?? null;
            user.sessionUpdatedAt = new Date();
            await user.save();

            return {
                success: true,
                message: "Login successful",
                sessionId: token,
                data: serializeUser(user)
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || "Login failed"
            };
        }
    }, {
        body: t.Object({
            phone: t.String({ minLength: 10 }),
            deviceId: t.Optional(t.String())
        })
    })

    // Logout — clears the active session for this device.
    .post("/logout", async ({ headers, set }) => {
        const auth = await authenticateUser(headers, set);
        if (auth.error) return auth.error;

        auth.user.activeSessionId = null;
        auth.user.activeDeviceId = null;
        auth.user.sessionUpdatedAt = new Date();
        await auth.user.save();

        return { success: true, message: "Logged out" };
    })

    // Lightweight session check — the app can call this on home screen / app
    // open to confirm it is still the active device. Returns 401
    // SESSION_REVOKED if this device's token has been replaced by a new login.
    .get("/session/check", async ({ headers, set }) => {
        const auth = await authenticateUser(headers, set);
        if (auth.error) return auth.error;

        return { success: true, data: serializeUser(auth.user) };
    })

    // Get current user profile (token-authenticated).
    .get("/user/profile", async ({ headers, set }) => {
        const auth = await authenticateUser(headers, set);
        if (auth.error) return auth.error;

        return { success: true, data: serializeUser(auth.user) };
    })

    // Update favourites (token-authenticated, operates on the logged-in user).
    .put("/user/favourites", async ({ headers, set, body }) => {
        const auth = await authenticateUser(headers, set);
        if (auth.error) return auth.error;

        auth.user.favourites = body.favourites;
        await auth.user.save();

        return {
            success: true,
            message: "Favourites updated",
            data: { favourites: auth.user.favourites }
        };
    }, {
        body: t.Object({
            favourites: t.Array(t.String())
        })
    });
