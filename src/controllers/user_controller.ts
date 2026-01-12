import { Elysia, t } from "elysia";
import { UserModel } from "../models/User";

export const userController = new Elysia({ prefix: "/api" })

    // Register new user
    .post("/register", async ({ body }) => {
        console.log("[User Controller] POST /api/register - Request received");
        console.log("[User Controller] Request body:", JSON.stringify(body));

        const { name, phone } = body;

        try {
            // Check if user already exists
            const existingUser = await UserModel.findOne({ phone });
            console.log("[User Controller] Existing user check:", existingUser ? "Found" : "Not found");

            if (existingUser) {
                console.log("[User Controller] User already exists with phone:", phone);
                return {
                    success: false,
                    message: "User with this phone number already exists"
                };
            }

            // Create new user
            const newUser = new UserModel({
                name,
                phone,
                favourites: []
            });

            console.log("[User Controller] Creating new user...");
            await newUser.save();
            console.log("[User Controller] User created successfully:", newUser._id);

            return {
                success: true,
                message: "Registration successful",
                data: {
                    id: newUser._id,
                    name: newUser.name,
                    phone: newUser.phone
                }
            };
        } catch (error: any) {
            console.error("[User Controller] Registration error:", error);
            return {
                success: false,
                message: error.message || "Registration failed"
            };
        }
    }, {
        body: t.Object({
            name: t.String({ minLength: 1 }),
            phone: t.String({ minLength: 10 })
        })
    })

    // Login user
    .post("/login", async ({ body }) => {
        console.log("[User Controller] POST /api/login - Request received");
        console.log("[User Controller] Request body:", JSON.stringify(body));

        const { phone } = body;

        try {
            // Find user by phone
            const user = await UserModel.findOne({ phone });
            console.log("[User Controller] User lookup:", user ? "Found" : "Not found");

            if (!user) {
                console.log("[User Controller] User not found with phone:", phone);
                return {
                    success: false,
                    message: "User not found. Please register first."
                };
            }

            console.log("[User Controller] Login successful for user:", user._id);

            return {
                success: true,
                message: "Login successful",
                data: {
                    id: user._id,
                    name: user.name,
                    phone: user.phone,
                    favourites: user.favourites,
                    lastTransaction: user.lastTransaction
                }
            };
        } catch (error: any) {
            console.error("[User Controller] Login error:", error);
            return {
                success: false,
                message: error.message || "Login failed"
            };
        }
    }, {
        body: t.Object({
            phone: t.String({ minLength: 10 })
        })
    })

    // Get user profile
    .get("/user/:phone", async ({ params }) => {
        console.log("[User Controller] GET /api/user/:phone - Request received");
        console.log("[User Controller] Phone:", params.phone);

        try {
            const user = await UserModel.findOne({ phone: params.phone });

            if (!user) {
                return {
                    success: false,
                    message: "User not found"
                };
            }

            return {
                success: true,
                data: {
                    id: user._id,
                    name: user.name,
                    phone: user.phone,
                    favourites: user.favourites,
                    lastTransaction: user.lastTransaction,
                    createdAt: user.createdAt
                }
            };
        } catch (error: any) {
            console.error("[User Controller] Get user error:", error);
            return {
                success: false,
                message: error.message || "Failed to get user"
            };
        }
    })

    // Update favourites
    .put("/user/:phone/favourites", async ({ params, body }) => {
        console.log("[User Controller] PUT /api/user/:phone/favourites - Request received");
        console.log("[User Controller] Phone:", params.phone);
        console.log("[User Controller] Body:", JSON.stringify(body));

        try {
            const user = await UserModel.findOneAndUpdate(
                { phone: params.phone },
                { favourites: body.favourites },
                { new: true }
            );

            if (!user) {
                return {
                    success: false,
                    message: "User not found"
                };
            }

            console.log("[User Controller] Favourites updated for user:", user._id);

            return {
                success: true,
                message: "Favourites updated",
                data: {
                    favourites: user.favourites
                }
            };
        } catch (error: any) {
            console.error("[User Controller] Update favourites error:", error);
            return {
                success: false,
                message: error.message || "Failed to update favourites"
            };
        }
    }, {
        body: t.Object({
            favourites: t.Array(t.String())
        })
    });
