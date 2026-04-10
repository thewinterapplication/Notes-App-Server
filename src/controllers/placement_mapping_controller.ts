import { Elysia, t } from "elysia";
import { PlacementMappingModel } from "../models/PlacementMapping";
import {
    DEFAULT_COURSES,
    getPlacementMappingForCourse,
    getPlacementMappings,
    normalizeMappingKey,
    normalizeMappingText,
} from "../services/mapping_service";

export const placementMappingController = new Elysia()
    .get("/placement-mappings", () => Bun.file("mappings.html"))

    .get("/api/placement-mappings", async () => {
        const mappings = await getPlacementMappings();
        return { mappings };
    })

    .get("/api/placement-mappings/:course", async ({ params }) => {
        return await getPlacementMappingForCourse(params.course);
    })

    .post("/api/placement-mappings", async ({ body, set }) => {
        const course = normalizeMappingText(body.course);
        if (!course) {
            set.status = 400;
            return { error: "Course name cannot be empty" };
        }

        const storedMappings = await PlacementMappingModel.find();
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
            const mappings = await getPlacementMappings();
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
            mapping = await PlacementMappingModel.create({ course, subjects: [], hidden: false });
        }

        return { course: mapping.course, subjects: mapping.subjects };
    }, {
        body: t.Object({
            course: t.String({ minLength: 1 })
        })
    })

    .post("/api/placement-mappings/:course/subjects", async ({ params, body, set }) => {
        const subject = body.subject.trim();
        if (!subject) {
            set.status = 400;
            return { error: "Subject name cannot be empty" };
        }

        const mapping = await PlacementMappingModel.findOneAndUpdate(
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

    .delete("/api/placement-mappings/:course/subjects/:subject", async ({ params }) => {
        const mapping = await PlacementMappingModel.findOneAndUpdate(
            { course: params.course },
            { $pull: { subjects: decodeURIComponent(params.subject) } },
            { new: true }
        );
        if (!mapping) {
            return { course: params.course, subjects: [] };
        }
        return { course: mapping.course, subjects: mapping.subjects };
    })

    .delete("/api/placement-mappings/:course", async ({ params }) => {
        const normalizedCourse = normalizeMappingKey(params.course);
        const isDefaultCourse = DEFAULT_COURSES.some(
            (course) => normalizeMappingKey(course) === normalizedCourse
        );

        if (isDefaultCourse) {
            await PlacementMappingModel.findOneAndUpdate(
                { course: params.course },
                {
                    $set: { hidden: true, subjects: [] },
                    $setOnInsert: { course: params.course }
                },
                { upsert: true, new: true }
            );
            return { success: true };
        }

        await PlacementMappingModel.findOneAndDelete({ course: params.course });
        return { success: true };
    });
