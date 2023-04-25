export default defineEventHandler(async event => {
    const tokenData = readTokenData(event)
    if (!tokenData) return

    return await prisma.survey.findMany({ where: { userId: tokenData.id }, include: { respondents: true, questions: { orderBy: { index: 'asc' } } }, orderBy: { createdAt: 'desc' } })
})
