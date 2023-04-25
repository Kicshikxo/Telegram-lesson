import { SurveyStatus } from "@prisma/client"

export default defineEventHandler(async event => {
    const tokenData = readTokenData(event)
    if (!tokenData) return

    const query = getQuery(event) as { surveyId: string }

    const survey = await prisma.survey.findUnique({ where: { id: query.surveyId } })
    if (!survey) return

    await prisma.survey.update({ where: { id: survey.id }, data: { status: SurveyStatus.FINISHED } })

    return { success: true }
})
