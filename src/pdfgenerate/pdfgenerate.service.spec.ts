import { Test, TestingModule } from '@nestjs/testing';
import { PdfgenerateService } from './pdfgenerate.service';

describe('PdfgenerateService', () => {
  let service: PdfgenerateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfgenerateService],
    }).compile();

    service = module.get<PdfgenerateService>(PdfgenerateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
