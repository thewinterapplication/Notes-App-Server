import { Elysia, t } from "elysia";
import { MappingModel } from "../models/Mapping";

const DEFAULT_COURSES = ["CSE", "ECE", "EEE", "CIVIL", "MECHANICAL"];
type CourseMapping = { course: string; subjects: string[] };

function normalizeText(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

function normalizeForCompare(value: string) {
    return normalizeText(value).toLowerCase();
}

async function getMappings() {
    const storedMappings = await MappingModel.find().sort({ course: 1 });
    const remainingMappings = new Map(
        storedMappings.map((mapping) => [normalizeForCompare(mapping.course), mapping])
    );

    const mappings = DEFAULT_COURSES.map((course) => {
        const key = normalizeForCompare(course);
        const mapping = remainingMappings.get(key);

        if (mapping) {
            remainingMappings.delete(key);
            if (mapping.hidden) {
                return null;
            }
            return { course: mapping.course, subjects: mapping.subjects };
        }

        return { course, subjects: [] };
    }).filter((mapping): mapping is CourseMapping => mapping !== null);

    const customMappings = Array.from(remainingMappings.values())
        .filter((mapping) => !mapping.hidden)
        .sort((left, right) => left.course.localeCompare(right.course))
        .map((mapping) => ({ course: mapping.course, subjects: mapping.subjects }));

    return [...mappings, ...customMappings];
}

export const mappingController = new Elysia()
    .get("/mappings", () => Bun.file("mappings.html"))

    .get("/api/mappings", async () => {
        const mappings = await getMappings();
        return { mappings };
    })

    .get("/api/mappings/:course", async ({ params }) => {
        const mapping = await MappingModel.findOne({ course: params.course });
        if (!mapping) {
            return { course: params.course, subjects: [] };
        }
        return { course: mapping.course, subjects: mapping.subjects };
    })

    .post("/api/mappings", async ({ body, set }) => {
        const course = normalizeText(body.course);
        if (!course) {
            set.status = 400;
            return { error: "Course name cannot be empty" };
        }

        const storedMappings = await MappingModel.find();
        const existingMapping = storedMappings.find(
            (mapping) => normalizeForCompare(mapping.course) === normalizeForCompare(course)
        );

        if (existingMapping && !existingMapping.hidden) {
            set.status = 409;
            return { error: "Course already exists" };
        }

        const isDefaultCourse = DEFAULT_COURSES.some(
            (defaultCourse) => normalizeForCompare(defaultCourse) === normalizeForCompare(course)
        );

        if (isDefaultCourse) {
            const mappings = await getMappings();
            const alreadyExists = mappings.some(
                (mapping) => normalizeForCompare(mapping.course) === normalizeForCompare(course)
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
        const normalizedCourse = normalizeForCompare(params.course);
        const isDefaultCourse = DEFAULT_COURSES.some(
            (course) => normalizeForCompare(course) === normalizedCourse
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
