import { describe, it, expect } from 'vitest';
import {
  resolveMarket,
  getMarketConfig,
  DEFAULT_MARKET,
  type MarketCode
} from './market-config.ts';

describe('market-config', () => {
  describe('resolveMarket', () => {
    it('should resolve valid market codes', () => {
      expect(resolveMarket('VN')).toBe('VN');
      expect(resolveMarket('TH')).toBe('TH');
      expect(resolveMarket('HK')).toBe('HK');
      expect(resolveMarket('ID')).toBe('ID');
    });

    it('should handle lowercase input', () => {
      expect(resolveMarket('vn')).toBe('VN');
      expect(resolveMarket('th')).toBe('TH');
      expect(resolveMarket('hk')).toBe('HK');
      expect(resolveMarket('id')).toBe('ID');
    });

    it('should trim whitespace', () => {
      expect(resolveMarket('  VN  ')).toBe('VN');
      expect(resolveMarket('\tTH\n')).toBe('TH');
    });

    it('should throw error for missing market', () => {
      expect(() => resolveMarket(undefined)).toThrow('market is required');
      expect(() => resolveMarket(null)).toThrow('market is required');
      expect(() => resolveMarket('')).toThrow('market is required');
      expect(() => resolveMarket('   ')).toThrow('market is required');
    });

    it('should throw error for invalid market codes', () => {
      expect(() => resolveMarket('US')).toThrow('Unknown market "US"');
      expect(() => resolveMarket('invalid')).toThrow('Unknown market "invalid"');
      expect(() => resolveMarket('123')).toThrow('Unknown market "123"');
    });

    it('should provide helpful error messages with supported markets', () => {
      try {
        resolveMarket('XX');
      } catch (error) {
        expect(error.message).toContain('Supported values: VN, TH, HK, ID');
      }
    });
  });

  describe('getMarketConfig', () => {
    it('should return valid config for VN market', () => {
      const config = getMarketConfig('VN');
      expect(config.code).toBe('VN');
      expect(config.ocrLangs).toEqual(['vi', 'en']);
      expect(config.promptLanguage).toBe('Vietnamese');
      expect(config.fieldRules).toBeDefined();
      expect(config.titleCaseNameRe).toBeInstanceOf(RegExp);
      expect(config.allCapsNameRe).toBeInstanceOf(RegExp);
    });

    it('should return valid config for TH market', () => {
      const config = getMarketConfig('TH');
      expect(config.code).toBe('TH');
      expect(config.ocrLangs).toEqual(['th', 'en']);
      expect(config.promptLanguage).toBe('Thai');
      expect(config.fieldRules).toBeDefined();
      expect(config.titleCaseNameRe).toBeInstanceOf(RegExp);
      expect(config.allCapsNameRe).toBeInstanceOf(RegExp);
    });

    it('should return valid config for HK market', () => {
      const config = getMarketConfig('HK');
      expect(config.code).toBe('HK');
      expect(config.ocrLangs).toEqual(['ch_tra', 'en']);
      expect(config.promptLanguage).toBe('Traditional Chinese');
      expect(config.fieldRules).toBeDefined();
      expect(config.titleCaseNameRe).toBeInstanceOf(RegExp);
      expect(config.allCapsNameRe).toBeInstanceOf(RegExp);
    });

    it('should return valid config for ID market', () => {
      const config = getMarketConfig('ID');
      expect(config.code).toBe('ID');
      expect(config.ocrLangs).toEqual(['id', 'en']);
      expect(config.promptLanguage).toBe('Indonesian');
      expect(config.fieldRules).toBeDefined();
      expect(config.titleCaseNameRe).toBeInstanceOf(RegExp);
      expect(config.allCapsNameRe).toBeInstanceOf(RegExp);
    });

    it('should have different configs for different markets', () => {
      const vnConfig = getMarketConfig('VN');
      const thConfig = getMarketConfig('TH');

      expect(vnConfig.ocrLangs).not.toEqual(thConfig.ocrLangs);
      expect(vnConfig.promptLanguage).not.toBe(thConfig.promptLanguage);
      expect(vnConfig.fieldRules).not.toBe(thConfig.fieldRules);
    });
  });

  describe('market field rules', () => {
    it('should have insurance_id rules for VN market', () => {
      const config = getMarketConfig('VN');
      const insuranceRules = config.fieldRules.filter(rule => rule.label === 'insurance_id');
      expect(insuranceRules.length).toBeGreaterThan(0);

      // Test some VN-specific patterns
      expect(insuranceRules.some(rule => rule.re.test('BHXH123456'))).toBe(true);
      expect(insuranceRules.some(rule => rule.re.test('GB1234567'))).toBe(true);
    });

    it('should have amount rules for TH market', () => {
      const config = getMarketConfig('TH');
      const amountRules = config.fieldRules.filter(rule => rule.label === 'amount');
      expect(amountRules.length).toBeGreaterThan(0);

      // Test Thai Baht patterns
      expect(amountRules.some(rule => rule.re.test('1000 บาท'))).toBe(true);
      expect(amountRules.some(rule => rule.re.test('฿500'))).toBe(true);
    });

    it('should have date rules for HK market', () => {
      const config = getMarketConfig('HK');
      const dateRules = config.fieldRules.filter(rule => rule.label === 'date');
      expect(dateRules.length).toBeGreaterThan(0);

      // Test Chinese date patterns
      expect(dateRules.some(rule => rule.re.test('2024年3月15日'))).toBe(true);
    });

    it('should have ID-specific patterns for ID market', () => {
      const config = getMarketConfig('ID');
      const idRules = config.fieldRules.filter(rule => rule.label === 'id_number');
      expect(idRules.length).toBeGreaterThan(0);

      // Test Indonesian KTP pattern (16 digits)
      expect(idRules.some(rule => rule.re.test('1234567890123456'))).toBe(true);
    });
  });

  describe('name detection regexes', () => {
    it('should detect VN title case names', () => {
      const config = getMarketConfig('VN');
      expect(config.titleCaseNameRe.test('Nguyễn Văn An')).toBe(true);
      expect(config.titleCaseNameRe.test('Trần Thị Bình')).toBe(true);
      expect(config.titleCaseNameRe.test('NGUYEN VAN AN')).toBe(false);
      expect(config.titleCaseNameRe.test('nguyen van an')).toBe(false);
    });

    it('should detect VN all caps names', () => {
      const config = getMarketConfig('VN');
      expect(config.allCapsNameRe.test('NGUYEN VAN AN')).toBe(true);
      expect(config.allCapsNameRe.test('TRAN THI BINH')).toBe(true);
      expect(config.allCapsNameRe.test('Nguyen Van An')).toBe(false);
    });

    it('should detect Thai names', () => {
      const config = getMarketConfig('TH');
      expect(config.titleCaseNameRe.test('สมชาย จันทร์เพ็ญ')).toBe(true);
      expect(config.allCapsNameRe.test('SOMCHAI JANPEN')).toBe(true);
    });

    it('should detect ID names', () => {
      const config = getMarketConfig('ID');
      expect(config.titleCaseNameRe.test('Ahmad Suharto')).toBe(true);
      expect(config.allCapsNameRe.test('AHMAD SUHARTO')).toBe(true);
    });
  });

  describe('shared rules', () => {
    it('should apply ICD-10 diagnosis codes across all markets', () => {
      const markets: MarketCode[] = ['VN', 'TH', 'HK', 'ID'];

      for (const market of markets) {
        const config = getMarketConfig(market);
        const diagnosisRules = config.fieldRules.filter(rule => rule.label === 'diagnosis');
        expect(diagnosisRules.some(rule => rule.re.test('A12.3'))).toBe(true);
        expect(diagnosisRules.some(rule => rule.re.test('Z99'))).toBe(true);
      }
    });

    it('should detect generic date patterns across all markets', () => {
      const markets: MarketCode[] = ['VN', 'TH', 'HK', 'ID'];

      for (const market of markets) {
        const config = getMarketConfig(market);
        const dateRules = config.fieldRules.filter(rule => rule.label === 'date');
        expect(dateRules.some(rule => rule.re.test('15/03/2024'))).toBe(true);
        expect(dateRules.some(rule => rule.re.test('2024-03-15'))).toBe(true);
      }
    });

    it('should detect generic ID numbers across all markets', () => {
      const markets: MarketCode[] = ['VN', 'TH', 'HK', 'ID'];

      for (const market of markets) {
        const config = getMarketConfig(market);
        const idRules = config.fieldRules.filter(rule => rule.label === 'id_number');
        expect(idRules.some(rule => rule.re.test('123456789'))).toBe(true);
        expect(idRules.some(rule => rule.re.test('1234567890'))).toBe(true);
      }
    });
  });

  describe('default market', () => {
    it('should have VN as default market', () => {
      expect(DEFAULT_MARKET).toBe('VN');
    });
  });
});