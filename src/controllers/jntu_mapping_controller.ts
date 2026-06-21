import { Elysia, t } from "elysia";
import { JntuMappingModel } from "../models/JntuMapping";
import {
    DEFAULT_COURSES,
    getJntuMappingForCourse,
    getJntuMappings,
    normalizeMappingKey,
    normalizeMappingText,
} from "../services/mapping_service";
import { requireAdminAuth } from "../utils/admin_auth";

export const jntuMappingController = new Elysia()
    .get("/jntu-mappings", ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;
        return Bun.file("mappings.html");
    })

    .get("/api/jntu-mappings", async () => {
        const mappings = await getJntuMappings();
        return { mappings };
    })

    .get("/api/jntu-mappings/:course", async ({ params }) => {
        return await getJntuMappingForCourse(params.course);
    })

    .post("/api/jntu-mappings", async ({ body, set }) => {
        const course = normalizeMappingText(body.course);
        if (!course) {
            set.status = 400;
            return { error: "Course name cannot be empty" };
        }

        const storedMappings = await JntuMappingModel.find();
        const existingMapping = storedMappings.find(
            (mapping) => normalizeMappingKey(mapping.course) === normalizeMappingKey(course)
        );

        if (existingMapping && !existingMapping.hidden) {
            set.status = 409;
            return { error: "Course already exists" };
        }

        const isDefaultCourse = DEFAULT_COURSES.some(
            (defaultCourse) => normalizeMappingKey(defaultCourse) === normalizeMappingKey(course)
        );

        if (isDefaultCourse) {
            const mappings = await getJntuMappings();
            const alreadyExists = mappings.some(
                (mapping) => normalizeMappingKey(mapping.course) === normalizeMappingKey(course)
            );

            if (alreadyExists) {
                set.status = 409;
                return { error: "Course already exists" };
            }
        }

        let mapping;
        if (existingMapping) {
            existingMapping.course = course;
            existingMapping.hidden = false;
            mapping = await existingMapping.save();
        } else {
            mapping = await JntuMappingModel.create({ course, subjects: [], hidden: false });
        }

        return { course: mapping.course, subjects: mapping.subjects };
    }, {
        body: t.Object({
            course: t.String({ minLength: 1 })
        })
    })

    .post("/api/jntu-mappings/:course/subjects", async ({ params, body, set }) => {
        const subject = body.subject.trim();
        if (!subject) {
            set.status = 400;
            return { error: "Subject name cannot be empty" };
        }

        const mapping = await JntuMappingModel.findOneAndUpdate(
            { course: params.course },
            { $addToSet: { subjects: subject }, $set: { hidden: false } },
            { upsert: true, new: true }
        );
        return { course: mapping.course, subjects: mapping.subjects };
    }, {
        body: t.Object({
            subject: t.String({ minLength: 1 })
        })
    })

    .delete("/api/jntu-mappings/:course/subjects/:subject", async ({ params }) => {
        const mapping = await JntuMappingModel.findOneAndUpdate(
            { course: params.course },
            { $pull: { subjects: decodeURIComponent(params.subject) } },
            { new: true }
        );
        if (!mapping) {
            return { course: params.course, subjects: [] };
        }
        return { course: mapping.course, subjects: mapping.subjects };
    })

    .delete("/api/jntu-mappings/:course", async ({ params }) => {
        const normalizedCourse = normalizeMappingKey(params.course);
        const isDefaultCourse = DEFAULT_COURSES.some(
            (course) => normalizeMappingKey(course) === normalizedCourse
        );

        if (isDefaultCourse) {
            await JntuMappingModel.findOneAndUpdate(
                { course: params.course },
                {
                    $set: { hidden: true, subjects: [] },
                    $setOnInsert: { course: params.course }
                },
                { upsert: true, new: true }
            );
            return { success: true };
        }

        await JntuMappingModel.findOneAndDelete({ course: params.course });
        return { success: true };
    });
