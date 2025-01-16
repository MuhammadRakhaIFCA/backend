import { Test, TestingModule } from '@nestjs/testing';
import { FinpayController } from './finpay.controller';
import { FinpayService } from './finpay.service';

describe('FinpayController', () => {
  let controller: FinpayController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinpayController],
      providers: [FinpayService],
    }).compile();

    controller = module.get<FinpayController>(FinpayController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
