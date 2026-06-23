import { MappingModel } from "../models/Mapping";
import { PlacementMappingModel } from "../models/PlacementMapping";
import { JntuMappingModel, IJntuSemester } from "../models/JntuMapping";

export const DEFAULT_COURSES = ["CSE", "ECE", "EEE", "CIVIL", "MECHANICAL"];

export type CourseMapping = {
    course: string;
    subjects: string[];
};

export type JntuSemesterMapping = {
    name: string;
    subjects: string[];
};

export type JntuCourseMapping = {
    course: string;
    semesters: JntuSemesterMapping[];
};

export function normalizeMappingText(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

export function normalizeMappingKey(value: string) {
    return normalizeMappingText(value).toLowerCase();
}

async function getMappingsForModel(
    model: typeof MappingModel | typeof PlacementMappingModel
) {
    const storedMappings = await model.find().sort({ course: 1 });
    const remainingMappings = new Map(
        storedMappings.map((mapping) => [normalizeMappingKey(mapping.course), mapping])
    );

    const mappings = DEFAULT_COURSES.map((course) => {
        const key = normalizeMappingKey(course);
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

async function getMappingForCourseFromModel(
    model: typeof MappingModel | typeof PlacementMappingModel,
    course: string
) {
    const normalizedCourse = normalizeMappingKey(course);
    const mappings = await getMappingsForModel(model);

    return mappings.find(
        (mapping) => normalizeMappingKey(mapping.course) === normalizedCourse
    ) || { course, subjects: [] };
}

export async function getMappings() {
    return await getMappingsForModel(MappingModel);
}

export async function getPlacementMappings() {
    return await getMappingsForModel(PlacementMappingModel);
}

export async function getMappingForCourse(course: string) {
    return await getMappingForCourseFromModel(MappingModel, course);
}

export async function getPlacementMappingForCourse(course: string) {
    return await getMappingForCourseFromModel(PlacementMappingModel, course);
}

function serializeJntuSemesters(semesters: IJntuSemester[] = []): JntuSemesterMapping[] {
    return semesters.map((semester) => ({
        name: semester.name,
        subjects: Array.isArray(semester.subjects) ? [...semester.subjects] : [],
    }));
}

export async function getJntuMappings(): Promise<JntuCourseMapping[]> {
    const storedMappings = await JntuMappingModel.find().sort({ course: 1 });
    const remainingMappings = new Map(
        storedMappings.map((mapping) => [normalizeMappingKey(mapping.course), mapping])
    );

    const mappings = DEFAULT_COURSES.map((course) => {
        const key = normalizeMappingKey(course);
        const mapping = remainingMappings.get(key);

        if (mapping) {
            remainingMappings.delete(key);

            if (mapping.hidden) {
                return null;
            }

            return { course: mapping.course, semesters: serializeJntuSemesters(mapping.semesters) };
        }

        return { course, semesters: [] };
    }).filter((mapping): mapping is JntuCourseMapping => mapping !== null);

    const customMappings = Array.from(remainingMappings.values())
        .filter((mapping) => !mapping.hidden)
        .sort((left, right) => left.course.localeCompare(right.course))
        .map((mapping) => ({
            course: mapping.course,
            semesters: serializeJntuSemesters(mapping.semesters),
        }));

    return [...mappings, ...customMappings];
}

export async function getJntuMappingForCourse(course: string): Promise<JntuCourseMapping> {
    const normalizedCourse = normalizeMappingKey(course);
    const mappings = await getJntuMappings();

    return mappings.find(
        (mapping) => normalizeMappingKey(mapping.course) === normalizedCourse
    ) || { course, semesters: [] };
}

export async function getJntuSemesters(course: string): Promise<string[]> {
    const mapping = await getJntuMappingForCourse(course);
    return mapping.semesters.map((semester) => semester.name);
}

export async function getJntuSubjects(course: string, semester: string): Promise<string[]> {
    const normalizedSemester = normalizeMappingKey(semester);
    const mapping = await getJntuMappingForCourse(course);
    const matched = mapping.semesters.find(
        (item) => normalizeMappingKey(item.name) === normalizedSemester
    );
    return matched ? [...matched.subjects] : [];
}
