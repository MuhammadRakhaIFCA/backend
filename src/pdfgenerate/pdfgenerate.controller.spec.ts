import { Test, TestingModule } from '@nestjs/testing';
import { PdfgenerateController } from './pdfgenerate.controller';
import { PdfgenerateService } from './pdfgenerate.service';

describe('PdfgenerateController', () => {
  let controller: PdfgenerateController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PdfgenerateController],
      providers: [PdfgenerateService],
    }).compile();

    controller = module.get<PdfgenerateController>(PdfgenerateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
