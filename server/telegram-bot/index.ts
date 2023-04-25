import { Respondent, Survey, SurveyStatus } from "@prisma/client";
import { Context, Telegraf, deunionize } from "telegraf";
import { CallbackQuery } from "telegraf/typings/core/types/typegram";

export enum CallbackQueryDataType {
    QuestionReply
}

export interface CallbackQueryData {
    type: CallbackQueryDataType
    optionId: string
}

const telegramBot = new Telegraf(process.env.TELEGRAM_BOT_API_KEY!)

telegramBot.start(async (ctx) => {
    await ctx.reply('Введите своё ФИО после команды /auth')
})
telegramBot.command('auth', async (ctx) => {
    const respondent = await prisma.respondent.findUnique({ where: { telegramId: ctx.from.id } })
    if (respondent) return await ctx.reply('Вы уже авторизованы')

    const { text } = deunionize(ctx.message)
    const name = text?.match(/[А-ЯЁ][а-яё]+\s[А-ЯЁ][а-яё]+\s[А-ЯЁ][а-яё]+/)?.at(0)
    if (!name) return await ctx.reply('Неверный формат ФИО')

    const [secondName, firstName, middleName] = name.split(' ')
    await prisma.respondent.create({
        data: {
            secondName, firstName, middleName,
            telegramId: ctx.from.id
        }
    })
    await ctx.reply(`Вы успешно авторизованы`)
})
telegramBot.command('join', async (ctx) => {
    const respondent = await prisma.respondent.findUnique({ where: { telegramId: ctx.from.id } })
    if (!respondent) return await ctx.reply('Вы не авторизованы')

    const { text } = deunionize(ctx.message)
    const surveyShortId = text?.match(/[A-Z0-9]{4}/)?.at(0)
    if (!surveyShortId) return await ctx.reply('Неверный формат идентификатора опроса')

    if (await prisma.respondent.findFirst({ where: { telegramId: ctx.from.id, surveys: { some: { shortId: surveyShortId, status: SurveyStatus.NOT_STARTED } } } }))
        return await ctx.reply(`Вы уже присоединились к опросу ${surveyShortId}`)

    const survey = await prisma.survey.findFirst({ where: { shortId: surveyShortId, status: SurveyStatus.NOT_STARTED } })
    if (!survey) return await ctx.reply(`Опрос ${surveyShortId} не существует`)

    await prisma.respondent.update({
        where: { telegramId: ctx.from.id },
        data: { surveys: { connect: { id: survey.id } } }
    })
    await ctx.reply(`Вы присоединились к опросу ${surveyShortId}`)
})

export async function sendSurveyQuestion(options: { ctx?: Context, survey: Survey, respondent: Respondent, index: number }) {
    const question = await prisma.surveyQuestion.findFirst({ where: { surveyId: options.survey.id, index: { gte: options.index } }, include: { options: true }, orderBy: { index: 'asc' } })
    if (!question) {
        if (options.ctx) options.ctx.editMessageText('Спасибо за прохождение опроса!')
        else telegramBot.telegram.sendMessage(options.respondent.telegramId, 'Спасибо за прохождение опроса!')

        return
    }

    if (options.ctx) options.ctx.editMessageText(`Вопрос №${question.index}: ${question.title}`, {
        reply_markup: {
            inline_keyboard: question.options.map((option) => [{ text: option.value, callback_data: JSON.stringify({ type: CallbackQueryDataType.QuestionReply, optionId: option.id } as CallbackQueryData) }])
        }
    })
    else telegramBot.telegram.sendMessage(options.respondent.telegramId, `Вопрос №${question.index}: ${question.title}`, {
        reply_markup: {
            inline_keyboard: question.options.map((option) => [{ text: option.value, callback_data: JSON.stringify({ type: CallbackQueryDataType.QuestionReply, optionId: option.id } as CallbackQueryData) }])
        }
    })
}
telegramBot.on('callback_query', async (ctx) => {
    const { data: dataString } = ctx.callbackQuery as CallbackQuery.DataQuery
    if (!dataString) return

    const data = JSON.parse(dataString) as CallbackQueryData

    if (data.type === CallbackQueryDataType.QuestionReply) {
        const option = await prisma.surveyQuestionOption.findFirst({ where: { id: data.optionId, question: { survey: { status: SurveyStatus.IN_PROGRESS } } }, include: { question: { include: { survey: true } } } })
        const respondent = await prisma.respondent.findUnique({ where: { telegramId: ctx.from?.id } })

        if (!option || !respondent) return

        try {
            await prisma.respondentAnswer.create({ data: { respondentId: respondent?.id, optionId: option.id } })
        } catch (e) { console.error(e) }

        sendSurveyQuestion({ ctx, survey: option.question.survey, respondent, index: option.question.index + 1 })
    }
})

telegramBot.telegram.setMyCommands([
    {
        command: '/auth',
        description: 'Авторизация в системе'
    },
    {
        command: '/join',
        description: 'Подключение к опросу'
    }
])

export default telegramBot
