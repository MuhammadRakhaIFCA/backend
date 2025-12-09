import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { FjiDatabaseService } from 'src/database/database-fji.service';

@Injectable()
export class WhatsappService {
    constructor(
        private readonly databaseService: FjiDatabaseService,
        private readonly httpService: HttpService
    ) { }

    async createTemplate() {
        //POST
        const url = 'https://graph.facebook.com/v23.0/{wa business account id}/message_templates'
        const headers = {
            Authorization: "Bearer (access token)"
        }
        const body = {
            fname: "nama template",
            category: "utility | marketing | authorization",
            language: "en|id",
            parameter_format: "named | positional", //mending pake named
            components: [
                {
                    type: "body",
                    text: "thank you, {{first_name}}! your order number is {{order_number}}",
                    example: {
                        body_text_named_params: [
                            {
                                param_name: "first_name",
                                example: "Pablo"
                            },
                            {
                                param_name: "order_number",
                                example: "860198-230332"
                            }
                        ]
                    }
                }
            ]
        }
    }
    async checkTemplateStatus() {
        //GET
        const url = "https://graph.facebook.com/v23.0/{id template-nya}?fields=status"
        const headers = {
            Authorization: "Bearer (access token)"
        }
        const exampleOutput = {
            status: "APPROVED",
            id: "1259544702043867" //-> id yg kita kirim
        }
    }
    async blastWithTemplate() {
        //POST
        const url = 'https://graph.facebook.com/v23.0/102290129340398/message_templates'
        const headers = {
            Authorization: "Bearer (access token)"
        }
        const body = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: "+16505551234",
            type: "template",
            template: {
                name: "samain sama nama template di create template",
                language: {
                    code: "samain sama language yg didaftarin"
                },
                components: [
                    {
                        type: "body",
                        parameters: [
                            {
                                type: "text",
                                parameter_name: "first_name",
                                text: "Jessica"
                            },
                            {
                                type: "text",
                                parameter_name: "order_number",
                                text: "SKBUP2-4CPIG9"
                            }
                        ]
                    }
                ]
            }
        }
    }
}
