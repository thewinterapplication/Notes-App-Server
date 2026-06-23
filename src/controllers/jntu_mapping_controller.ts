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
        return await getJntuMappingForCourse(decodeURIComponent(params.course));
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
            mapping = await JntuMappingModel.create({ course, semesters: [], hidden: false });
        }

        return { course: mapping.course, semesters: mapping.semesters };
    }, {
        body: t.Object({
            course: t.String({ minLength: 1 })
        })
    })

    // Add a semester to a course
    .post("/api/jntu-mappings/:course/semesters", async ({ params, body, set }) => {
        const semester = normalizeMappingText(body.semester);
        if (!semester) {
            set.status = 400;
            return { error: "Semester name cannot be empty" };
        }

        const course = decodeURIComponent(params.course);
        const mapping = await JntuMappingModel.findOneAndUpdate(
            { course },
            { $set: { hidden: false }, $setOnInsert: { course } },
            { upsert: true, new: true }
        );

        const exists = mapping.semesters.some(
            (item) => normalizeMappingKey(item.name) === normalizeMappingKey(semester)
        );
        if (!exists) {
            mapping.semesters.push({ name: semester, subjects: [] });
            await mapping.save();
        }

        return { course: mapping.course, semesters: mapping.semesters };
    }, {
        body: t.Object({
            semester: t.String({ minLength: 1 })
        })
    })

    // Delete a semester from a course
    .delete("/api/jntu-mappings/:course/semesters/:semester", async ({ params }) => {
        const course = decodeURIComponent(params.course);
        const semester = decodeURIComponent(params.semester);
        const mapping = await JntuMappingModel.findOne({ course });

        if (!mapping) {
            return { course, semesters: [] };
        }

        mapping.semesters = mapping.semesters.filter(
            (item) => normalizeMappingKey(item.name) !== normalizeMappingKey(semester)
        );
        await mapping.save();

        return { course: mapping.course, semesters: mapping.semesters };
    })

    // Add a subject to a semester
    .post("/api/jntu-mappings/:course/semesters/:semester/subjects", async ({ params, body, set }) => {
        const subject = body.subject.trim();
        if (!subject) {
            set.status = 400;
            return { error: "Subject name cannot be empty" };
        }

        const course = decodeURIComponent(params.course);
        const semester = decodeURIComponent(params.semester);
        const mapping = await JntuMappingModel.findOneAndUpdate(
            { course },
            { $set: { hidden: false }, $setOnInsert: { course } },
            { upsert: true, new: true }
        );

        let targetSemester = mapping.semesters.find(
            (item) => normalizeMappingKey(item.name) === normalizeMappingKey(semester)
        );
        if (!targetSemester) {
            mapping.semesters.push({ name: semester, subjects: [] });
            targetSemester = mapping.semesters[mapping.semesters.length - 1];
        }

        const subjectExists = targetSemester.subjects.some(
            (item) => normalizeMappingKey(item) === normalizeMappingKey(subject)
        );
        if (!subjectExists) {
            targetSemester.subjects.push(subject);
        }
        await mapping.save();

        return { course: mapping.course, semesters: mapping.semesters };
    }, {
        body: t.Object({
            subject: t.String({ minLength: 1 })
        })
    })

    // Remove a subject from a semester
    .delete("/api/jntu-mappings/:course/semesters/:semester/subjects/:subject", async ({ params }) => {
        const course = decodeURIComponent(params.course);
        const semester = decodeURIComponent(params.semester);
        const subject = decodeURIComponent(params.subject);
        const mapping = await JntuMappingModel.findOne({ course });

        if (!mapping) {
            return { course, semesters: [] };
        }

        const targetSemester = mapping.semesters.find(
            (item) => normalizeMappingKey(item.name) === normalizeMappingKey(semester)
        );
        if (targetSemester) {
            targetSemester.subjects = targetSemester.subjects.filter(
                (item) => normalizeMappingKey(item) !== normalizeMappingKey(subject)
            );
            await mapping.save();
        }

        return { course: mapping.course, semesters: mapping.semesters };
    })

    .delete("/api/jntu-mappings/:course", async ({ params }) => {
        const course = decodeURIComponent(params.course);
        const normalizedCourse = normalizeMappingKey(course);
        const isDefaultCourse = DEFAULT_COURSES.some(
            (item) => normalizeMappingKey(item) === normalizedCourse
        );

        if (isDefaultCourse) {
            await JntuMappingModel.findOneAndUpdate(
                { course },
                {
                    $set: { hidden: true, semesters: [] },
                    $setOnInsert: { course }
                },
                { upsert: true, new: true }
            );
            return { success: true };
        }

        await JntuMappingModel.findOneAndDelete({ course });
        return { success: true };
    });
