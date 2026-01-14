import { Elysia, t } from "elysia";
import { UserModel } from "../models/User";

export const userController = new Elysia({ prefix: "/api" })

    // Register new user
    .post("/register", async ({ body }) => {
        const { name, phone } = body;

        try {
            const existingUser = await UserModel.findOne({ phone });

            if (existingUser) {
                return {
                    success: false,
                    message: "User with this phone number already exists"
                };
            }

            const newUser = new UserModel({
                name,
                phone,
                favourites: []
            });

            await newUser.save();

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
        const { phone } = body;

        try {
            const user = await UserModel.findOne({ phone });

            if (!user) {
                return {
                    success: false,
                    message: "User not found. Please register first."
                };
            }

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
            return {
                success: false,
                message: error.message || "Failed to get user"
            };
        }
    })

    // Update favourites
    .put("/user/:phone/favourites", async ({ params, body }) => {
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

            return {
                success: true,
                message: "Favourites updated",
                data: {
                    favourites: user.favourites
                }
            };
        } catch (error: any) {
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
