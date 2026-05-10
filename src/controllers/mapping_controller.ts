import { Elysia, t } from "elysia";
import { MappingModel } from "../models/Mapping";
import {
    DEFAULT_COURSES,
    getMappingForCourse,
    getMappings,
    normalizeMappingKey,
    normalizeMappingText,
} from "../services/mapping_service";
import { requireAdminAuth } from "../utils/admin_auth";

export const mappingController = new Elysia()
    .get("/mappings", ({ cookie, set, request }) => {
        const authError = requireAdminAuth({ cookie, set, request });
        if (authError) return authError;
        return Bun.file("mappings.html");
    })

    .get("/api/mappings", async () => {
        const mappings = await getMappings();
        return { mappings };
    })

    .get("/api/mappings/:course", async ({ params }) => {
        return await getMappingForCourse(params.course);
    })

    .post("/api/mappings", async ({ body, set }) => {
        const course = normalizeMappingText(body.course);
        if (!course) {
            set.status = 400;
            return { error: "Course name cannot be empty" };
        }

        const storedMappings = await MappingModel.find();
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
            const mappings = await getMappings();
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
            mapping = await MappingModel.create({ course, subjects: [], hidden: false });
        }

        return { course: mapping.course, subjects: mapping.subjects };
    }, {
        body: t.Object({
            course: t.String({ minLength: 1 })
        })
    })

    .post("/api/mappings/:course/subjects", async ({ params, body, set }) => {
        const subject = body.subject.trim();
        if (!subject) {
            set.status = 400;
            return { error: "Subject name cannot be empty" };
        }

        const mapping = await MappingModel.findOneAndUpdate(
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

    .delete("/api/mappings/:course/subjects/:subject", async ({ params }) => {
        const mapping = await MappingModel.findOneAndUpdate(
            { course: params.course },
            { $pull: { subjects: decodeURIComponent(params.subject) } },
            { new: true }
        );
        if (!mapping) {
            return { course: params.course, subjects: [] };
        }
        return { course: mapping.course, subjects: mapping.subjects };
    })

    .delete("/api/mappings/:course", async ({ params }) => {
        const normalizedCourse = normalizeMappingKey(params.course);
        const isDefaultCourse = DEFAULT_COURSES.some(
            (course) => normalizeMappingKey(course) === normalizedCourse
        );

        if (isDefaultCourse) {
            await MappingModel.findOneAndUpdate(
                { course: params.course },
                {
                    $set: { hidden: true, subjects: [] },
                    $setOnInsert: { course: params.course }
                },
                { upsert: true, new: true }
            );
            return { success: true };
        }

        await MappingModel.findOneAndDelete({ course: params.course });
        return { success: true };
    });
