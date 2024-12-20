import { Test, TestingModule } from '@nestjs/testing';
import { FinpayService } from './finpay.service';

describe('FinpayService', () => {
  let service: FinpayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinpayService],
    }).compile();

    service = module.get<FinpayService>(FinpayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
