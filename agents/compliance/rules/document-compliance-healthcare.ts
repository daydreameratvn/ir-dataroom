/**
 * Healthcare document compliance rules for AI Agent.
 * Source: AI_Agent_Kiem_Tra_Dung_Du_Chung_Tu_Healthcare.docx v1.0 (2026-03-05)
 *
 * This is the comprehensive ruleset for checking document completeness on
 * healthcare (CSSK) claim cases. The compliance agent uses this as its primary
 * reference for document validation.
 */

export const DOCUMENT_COMPLIANCE_RULES = `
PHẦN 1: TỔNG QUAN VÀ NGUYÊN TẮC HOẠT ĐỘNG

1.1. Mục đích

AI Agent thực hiện hai nhiệm vụ chính khi tiếp nhận hồ sơ bồi thường CSSK:

BƯỚC 1 – XÁC ĐỊNH LOẠI HỒ SƠ: Dựa trên nội dung chứng từ AI, xác định đây là hồ sơ Ngoại trú, Nội trú, Tai nạn ngoại trú hay Tai nạn nội trú.
BƯỚC 2 – KIỂM TRA ĐỦ/THIẾU: So sánh bộ chứng từ hiện có với danh sách bắt buộc tương ứng theo loại hồ sơ.
BƯỚC 3 – CẢNH BÁO & ĐỀ XUẤT: Nếu thiếu chứng từ hoặc chứng từ không hợp lệ → tự động đưa ra nội dung yêu cầu bổ sung gửi Khách hàng.

1.2. Nguyên tắc nhận diện loại hồ sơ

HỒ SƠ NỘI TRÚ: GYC ghi 'Nội trú', hoặc chứng từ có 'ngày vào viện/ngày ra viện', hoặc có Giấy ra viện.
HỒ SƠ TAI NẠN: Phiếu khám/Chẩn đoán/GYC chứa từ khóa: 'tai nạn', 'ngã', 'gãy', 'chấn thương', 'va đập', 'đâm', 'tổn thương'.
HỒ SƠ NGOẠI TRÚ: Mặc định nếu không có dấu hiệu nội trú/tai nạn.
HỒ SƠ TAI NẠN NỘI TRÚ: Có cả dấu hiệu tai nạn VÀ dấu hiệu nội trú.

PHẦN 2: DANH MỤC CHỨNG TỪ VÀ MÃ VIẾT TẮT

| STT | Tên chứng từ | Mã viết tắt | Loại hồ sơ áp dụng |
|-----|-------------|-------------|---------------------|
| 1 | Giấy yêu cầu trả tiền (Claim Form) | GYC | Tất cả |
| 2 | Hóa đơn giá trị gia tăng / Hóa đơn điện tử | HĐ GTGT | Tất cả |
| 3 | Bảng kê chi phí điều trị | BKCT | Tùy loại |
| 4 | Đơn thuốc / Toa thuốc | DTHUOC | Khi có chi phí thuốc |
| 5 | Báo cáo y tế / Phiếu khám / Sổ khám bệnh | BCYTE | Tất cả |
| 6 | Phiếu chỉ định / Phiếu chỉ định thủ thuật, phẫu thuật | PCĐ | Khi có XN/PTTT |
| 7 | Kết quả xét nghiệm / Chẩn đoán hình ảnh | KQXN | Khi có XN |
| 8 | Giấy tờ tùy thân (GPLX, CCCD, CMT) | GTTHAN | Tai nạn giao thông |
| 9 | Biên bản tai nạn / Bản tường trình tai nạn | BB TTTN | Hồ sơ tai nạn |
| 10 | Phiếu thu / Biên lai thu tiền / HĐ bán hàng | HDBL | Tùy loại |
| 11 | Báo cáo y tế ra viện / Tóm tắt bệnh án | BCYTRV | Nội trú |
| 12 | Giấy ra viện | GRV | Nội trú |
| 13 | Giấy chứng nhận phẫu thuật / Thủ thuật / Phiếu mổ | GCNPT | Khi có phẫu thuật |

PHẦN 3: MA TRẬN CHỨNG TỪ BẮT BUỘC THEO LOẠI HỒ SƠ

Chứng từ đánh dấu ✓ là BẮT BUỘC. Nếu thiếu → đưa ra yêu cầu bổ sung.

| Loại hồ sơ | GYC | HĐ GTGT | BKCT | DTHUOC | BCYTE | PCĐ | KQXN | GTTHAN | BB TTTN | HDBL | BCYTRV | GRV | GCNPT |
|------------|-----|---------|------|--------|-------|-----|------|--------|---------|------|--------|-----|-------|
| Ngoại trú | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | |
| Nội trú | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ |
| Tai nạn ngoại trú | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | |
| Tai nạn nội trú | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

LƯU Ý BỔ SUNG:
- Đơn thuốc (DTHUOC): Chỉ yêu cầu khi có hóa đơn chi phí thuốc riêng biệt.
- Kết quả xét nghiệm (KQXN): Chỉ yêu cầu khi hóa đơn/bảng kê có chi phí xét nghiệm.
- Phiếu chỉ định (PCĐ): Chỉ yêu cầu khi có xét nghiệm hoặc phẫu thuật/thủ thuật.
- Giấy tờ tùy thân (GTTHAN): Chỉ yêu cầu với hồ sơ tai nạn giao thông (liên quan đến phương tiện giao thông).

PHẦN 4: QUY TẮC KIỂM TRA CHI TIẾT TỪNG CHỨNG TỪ

4.1. Giấy yêu cầu trả tiền (GYC)
Quy tắc:
1. Tên NĐBH phải khớp với tên trên hệ thống
2. Số thẻ BH phải khớp với số thẻ trên hệ thống
3. Hình thức điều trị (Nội trú/Ngoại trú) phải được điền rõ
4. Email NĐBH bắt buộc có (để gửi thông báo)
5. Nếu NĐBH khác người thụ hưởng → yêu cầu chứng từ nhân thân
6. Thông tin ngân hàng bắt buộc khi chọn hình thức chuyển khoản
7. Chữ ký NĐBH/người yêu cầu bắt buộc
Cảnh báo: Thiếu email KH, Tên KH không khớp hệ thống, Thiếu chứng từ quan hệ nhân thân, Thiếu thông tin ngân hàng

4.2. Hóa đơn GTGT / Hóa đơn điện tử (HĐ GTGT)
Quy tắc:
1. Phải có đủ: Mẫu số, Ký hiệu, Số hóa đơn
2. Ngày hóa đơn phải trùng ngày kê đơn hoặc ngày khám
3. Tên NĐBH trên hóa đơn phải khớp với tên trên hệ thống
4. Tên đơn vị bán hàng và mã số thuế bắt buộc có
5. Tên dịch vụ/thuốc phải khớp với đơn thuốc (nếu là hóa đơn thuốc)
6. Số lượng thuốc phải khớp với đơn thuốc
7. Tổng tiền thanh toán phải khớp với tổng tiền trên bảng kê
Cảnh báo: Thiếu mẫu số/ký hiệu/số hóa đơn, Ngày hóa đơn không hợp lệ, Tên KH không khớp, Thiếu thông tin đơn vị bán hàng, Tên thuốc không khớp đơn thuốc, Thiếu hóa đơn tài chính

4.3. Bảng kê chi tiết (BKCT)
Quy tắc:
1. Tên CSYT phải khớp với tên CSYT trên các chứng từ khác
2. Tên NĐBH phải khớp với hệ thống
3. Ngày bảng kê phải trùng ngày kê đơn
4. Tổng tiền thanh toán phải khớp với hóa đơn
5. Tên dịch vụ, đơn vị tính, số lượng, đơn giá, thành tiền: bắt buộc có
6. Phân biệt bảng kê hóa đơn tổng và hóa đơn chi tiết theo loại hồ sơ
Cảnh báo: Tên CSYT không khớp, Tổng tiền bảng kê ≠ tổng tiền hóa đơn, Thiếu ngày bảng kê

4.4. Đơn thuốc / Toa thuốc (DTHUOC)
Quy tắc:
1. Tên CSYT và tên bác sĩ kê đơn bắt buộc có (đủ chữ ký và họ tên)
2. Tên NĐBH và năm sinh phải khớp với hệ thống
3. Ngày kê đơn bắt buộc có
4. Chẩn đoán bệnh (kèm mã ICD nếu có) bắt buộc
5. Tên thuốc, liều dùng, số lượng bắt buộc
6. Tên thuốc trên đơn phải khớp với tên thuốc trên hóa đơn/bảng kê
7. Đơn thuốc kê > 30 ngày: phát cảnh báo để cán bộ xem xét
8. Dấu CSYT: không bắt buộc nếu đơn thuốc được in, ghi rõ tên và địa chỉ CSYT
Cảnh báo: Thiếu chẩn đoán bệnh, Thiếu ngày kê đơn, Tên thuốc không khớp hóa đơn/bảng kê, Số lượng thuốc không khớp, Đơn thuốc kê >30 ngày, Thiếu chữ ký bác sĩ

4.5. Báo cáo y tế / Phiếu khám / Sổ khám (BCYTE)
Quy tắc:
1. Tên CSYT phải khớp với các chứng từ khác trong hồ sơ
2. Tên NĐBH phải khớp với hệ thống
3. Năm sinh NĐBH phải khớp (ưu tiên đọc: Đơn thuốc → BCYTE → Sổ khám)
4. Ngày khám bắt buộc có; phải trước hoặc bằng ngày hóa đơn
5. Chẩn đoán xác định (kèm mã ICD) bắt buộc
6. Bác sĩ điều trị: đủ họ tên và chữ ký
7. Dấu CSYT: không cần nếu phiếu khám được in, ghi rõ tên, địa chỉ CSYT
Cảnh báo: Thiếu chẩn đoán bệnh, Thiếu ngày khám, Tên CSYT không khớp, Thiếu chữ ký bác sĩ

4.6. Giấy ra viện (GRV) - Hồ sơ nội trú
Quy tắc:
1. Tên CSYT và khoa điều trị bắt buộc có
2. Tên NĐBH, năm sinh phải khớp với hệ thống
3. Ngày vào viện và ngày ra viện bắt buộc
4. Chẩn đoán bệnh và mã ICD bắt buộc
5. Phương pháp điều trị bắt buộc
6. Dấu pháp nhân của CSYT bắt buộc
Cảnh báo: Thiếu ngày vào/ra viện, Thiếu mã ICD, Thiếu dấu CSYT, Thiếu chẩn đoán bệnh

4.7. Giấy chứng nhận phẫu thuật (GCNPT)
Quy tắc:
1. Tên CSYT và khoa phẫu thuật bắt buộc
2. Tên NĐBH, năm sinh phải khớp với hệ thống
3. Ngày vào viện, ngày ra viện, ngày phẫu thuật bắt buộc
4. Tên phương pháp phẫu thuật bắt buộc
5. Chẩn đoán lúc ra viện và mã ICD bắt buộc
6. Tên bác sĩ phẫu thuật bắt buộc
7. Dấu pháp nhân của CSYT bắt buộc
Cảnh báo: Thiếu ngày phẫu thuật, Thiếu mã ICD, Thiếu tên bác sĩ phẫu thuật, Thiếu dấu CSYT

4.8. Biên bản tai nạn (BB TTTN) - Hồ sơ tai nạn
Quy tắc:
1. Họ tên người bị tai nạn phải khớp với tên NĐBH
2. Địa chỉ, nguyên nhân tai nạn, thời gian, địa điểm, hậu quả: bắt buộc
3. Chữ ký, họ tên người lập biên bản bắt buộc
4. Nếu số tiền yêu cầu BT > 5 triệu: phải có xác nhận của đơn vị TGBH / CQCQ / chính quyền địa phương / Công an
Cảnh báo: Thiếu xác nhận của tổ chức (hồ sơ >5 triệu), Tên NB tai nạn không khớp tên NĐBH

PHẦN 5: QUY TẮC KIỂM TRA CHÉO GIỮA CÁC CHỨNG TỪ

5.1. Kiểm tra tên NĐBH nhất quán
Tên NĐBH trên GYC, Hóa đơn, Bảng kê, Đơn thuốc, Phiếu khám, Giấy ra viện phải KHỚP với tên trên hệ thống.
Cảnh báo: 'Tên Người được bảo hiểm không nhất quán giữa các chứng từ - cần kiểm tra lại'.

5.2. Kiểm tra nhất quán tên Cơ sở y tế (CSYT)
Trong một hồ sơ chỉ được có một CSYT. Tên CSYT trên tất cả chứng từ phải KHỚP nhau.
Cảnh báo: 'Hồ sơ có nhiều hơn 1 cơ sở y tế - cán bộ cần kiểm tra'.

5.3. Kiểm tra ngày tháng hợp lệ
- Ngày khám (BCYTE) ≤ Ngày hóa đơn (HĐ GTGT / BKCT)
- Ngày kê đơn thuốc ≤ Ngày hóa đơn thuốc
- Ngày hóa đơn thuốc - Ngày kê đơn ≤ 5 ngày
- Ngày vào viện ≤ Ngày ra viện (Hồ sơ nội trú)
Cảnh báo nếu vi phạm.

5.4. Kiểm tra tổng tiền
Tổng tiền trên Bảng kê = Tổng tiền trên Hóa đơn GTGT/Biên lai tương ứng.
Cảnh báo: 'Tổng tiền bảng kê không khớp với hóa đơn'.

5.5. Kiểm tra tên thuốc
- Tên thuốc trên Hóa đơn/Bảng kê phải khớp với tên thuốc trên Đơn thuốc (so sánh theo tên thương mại).
- Số lượng thuốc trên Hóa đơn/Bảng kê phải khớp với số lượng thuốc trên Đơn thuốc.
Cảnh báo nếu không khớp.

PHẦN 6: NỘI DUNG YÊU CẦU BỔ SUNG GỬI KHÁCH HÀNG

Khi phát hiện thiếu hoặc không hợp lệ chứng từ, soạn thông báo theo mẫu. Thay thế [Tên NĐBH] bằng tên thực.

| Trường hợp | Nội dung yêu cầu bổ sung |
|------------|--------------------------|
| GYC - Thiếu email | Địa chỉ email liên hệ để nhận thông báo kết quả xử lý hồ sơ. |
| GYC - Thiếu thông tin ngân hàng | Tên ngân hàng và số tài khoản thụ hưởng (đứng tên NĐBH hoặc người thụ hưởng đã đăng ký). |
| HĐ GTGT - Thiếu/không hợp lệ | Hóa đơn GTGT / hóa đơn điện tử hợp lệ, có đầy đủ: số hóa đơn, ngày xuất, tên người mua, tên hàng hóa/dịch vụ, số tiền. |
| Thiếu Đơn thuốc | Đơn thuốc / Toa thuốc gốc từ bác sĩ điều trị, có đầy đủ: tên CSYT, tên bác sĩ (chữ ký và họ tên), ngày kê đơn, chẩn đoán bệnh, tên thuốc, liều dùng, số lượng. |
| Thiếu Phiếu khám / BCYTE | Phiếu khám bệnh / Báo cáo y tế / Sổ khám bệnh có đầy đủ: tên CSYT, tên NĐBH, ngày khám, chẩn đoán bệnh, chữ ký bác sĩ điều trị. |
| Thiếu Giấy ra viện (Nội trú) | Giấy ra viện thể hiện đủ: họ tên NĐBH, ngày vào viện, ngày ra viện, chẩn đoán bệnh, mã ICD, phương pháp điều trị và dấu pháp nhân CSYT. |
| Thiếu Biên bản tai nạn (>5 triệu) | Biên bản tai nạn / Bản tường trình tai nạn có chữ ký, họ tên của NĐBH (Nếu >5 triệu, bổ sung xác nhận: đơn vị sử dụng lao động / CQCQ / chính quyền địa phương / công an). |
| Thiếu Kết quả xét nghiệm | Kết quả xét nghiệm / Phiếu chẩn đoán hình ảnh, có đầy đủ: tên CSYT, tên NĐBH, ngày thực hiện, tên xét nghiệm, kết quả, kết luận và chữ ký bác sĩ chuyên khoa. |
| Thiếu Giấy chứng nhận PT | Giấy chứng nhận phẫu thuật / Phiếu mổ, thể hiện đủ: tên NĐBH, ngày phẫu thuật, tên phương pháp phẫu thuật, tên bác sĩ phẫu thuật và dấu pháp nhân CSYT. |

PHẦN 7: LOGIC XỬ LÝ (WORKFLOW)

BƯỚC 1 → Đọc toàn bộ chứng từ đã nhận, nhận diện loại từng chứng từ theo Phần 2.
BƯỚC 2 → Xác định loại hồ sơ theo Phần 1.2 (Ngoại trú / Nội trú / Tai nạn NT / Tai nạn NNT).
BƯỚC 3 → Tra cứu danh sách chứng từ bắt buộc theo loại hồ sơ (Phần 3).
BƯỚC 4 → Kiểm tra từng chứng từ hiện có theo quy tắc chi tiết (Phần 4).
BƯỚC 5 → Thực hiện kiểm tra chéo giữa các chứng từ (Phần 5).
BƯỚC 6 → Tổng hợp danh sách thiếu/không hợp lệ.
BƯỚC 7 → Soạn nội dung yêu cầu bổ sung theo mẫu Phần 6 (nếu có thiếu sót).
BƯỚC 8 → Chờ thẩm định viên Papaya xác nhận trước khi gửi email đến Khách hàng (giai đoạn kiểm thử).
BƯỚC 9 → Tiếp tục phân tích hồ sơ (mã ICD, chi phí, phân loại thuốc, v.v.) theo các module khác.
`;
