# BUSINESS PLAN  
## P2P Secure Chat System for Students

---

# 1. Executive Summary

Dự án đề xuất xây dựng một hệ thống chat ngang hàng (Peer-to-Peer Chat System) dành cho sinh viên, cho phép người dùng trao đổi tin nhắn trực tiếp mà không phụ thuộc hoàn toàn vào máy chủ trung tâm. Hệ thống tập trung vào hai yếu tố chính: **phi tập trung (decentralization)** và **bảo mật (security)**.

Khác với các ứng dụng chat truyền thống, hệ thống sử dụng mô hình P2P giúp giảm tải server, tăng khả năng mở rộng và đảm bảo quyền riêng tư của người dùng. Dự án hướng tới việc áp dụng các kiến thức về hệ thống phân tán, truyền thông mạng và xử lý đồng thời trong môi trường thực tế.

---

# 2. Problem Statement

Hiện nay, hầu hết các ứng dụng chat phổ biến (Messenger, Zalo, Discord) đều phụ thuộc vào server trung tâm, dẫn đến các vấn đề:

- Tăng tải hệ thống khi số lượng người dùng lớn  
- Nguy cơ rò rỉ dữ liệu từ server  
- Phụ thuộc vào hạ tầng tập trung (single point of failure)  
- Không phù hợp với các hệ thống phân tán hoặc môi trường mạng nội bộ  

Đối với sinh viên trong môi trường học tập, đặc biệt là các nhóm nhỏ hoặc mạng nội bộ, cần một giải pháp:

- Nhẹ, dễ triển khai  
- Không phụ thuộc server lớn  
- Bảo mật thông tin trao đổi  

---

# 3. Proposed Solution

Hệ thống **P2P Secure Chat** được đề xuất với các đặc điểm:

- Mỗi người dùng là một peer (client + server)  
- Giao tiếp trực tiếp giữa các peer thông qua TCP/WebSocket  
- Sử dụng bootstrap server nhẹ để hỗ trợ peer discovery  
- Áp dụng mã hóa (encryption) để đảm bảo an toàn thông tin  

Các chức năng chính:

- Chat 1-1 giữa các peer  
- Chat nhóm  
- Hiển thị trạng thái online/offline  
- Peer discovery  
- Truyền tin đáng tin cậy (retry nếu lỗi)  

---

# 4. System Overview

## 4.1 Kiến trúc tổng thể

Hệ thống gồm 2 thành phần chính:

- **Peer Node**
  - Gửi/nhận tin nhắn  
  - Kết nối với các peer khác  
  - Xử lý giao tiếp mạng  

- **Bootstrap Server (nhẹ)**
  - Lưu danh sách peer đang online  
  - Hỗ trợ peer mới tham gia mạng  

## 4.2 Luồng hoạt động

1. Peer đăng ký với bootstrap server  
2. Nhận danh sách peer đang online  
3. Thiết lập kết nối trực tiếp giữa các peer  
4. Trao đổi tin nhắn trực tiếp  
5. Mã hóa dữ liệu trước khi gửi  

---

# 5. Value Proposition

Hệ thống mang lại các giá trị chính:

- **Phi tập trung**: giảm phụ thuộc server  
- **Bảo mật cao**: dữ liệu không lưu trữ tập trung  
- **Hiệu quả**: giảm độ trễ do truyền trực tiếp  
- **Chi phí thấp**: không cần hạ tầng lớn  
- **Phù hợp môi trường học tập**: triển khai nhanh trong LAN  

---

# 6. Target Users

Đối tượng chính:

- Sinh viên trong trường đại học  
- Nhóm học tập nhỏ  
- Các lab hoặc môi trường nội bộ  

Use-case:

- Chat nhóm làm đồ án  
- Trao đổi nhanh trong mạng nội bộ  
- Demo hệ thống phân tán  

---

# 7. Competitive Analysis

| Tiêu chí | Chat truyền thống | P2P Chat |
|--------|-----------------|----------|
| Kiến trúc | Tập trung | Phi tập trung |
| Bảo mật | Phụ thuộc server | End-to-end |
| Khả năng mở rộng | Phụ thuộc server | Tự mở rộng |
| Độ trễ | Trung bình | Thấp |
| Chi phí | Cao | Thấp |

---

# 8. Technical Feasibility

Công nghệ sử dụng:

- Backend: NodeJS / Python (Socket Programming)  
- Giao thức: TCP / WebSocket  
- Frontend: Web (HTML, JS)  
- Concurrency: Thread / Async  
- Encryption: AES hoặc RSA cơ bản  

Khả năng triển khai:

- Phù hợp với kiến thức môn học  
- Có thể hoàn thành trong thời gian học kỳ  
- Không yêu cầu hạ tầng phức tạp  

---

# 9. Development Plan

## Giai đoạn 1: Thiết kế hệ thống
- Thiết kế kiến trúc P2P  
- Định nghĩa message protocol  

## Giai đoạn 2: Xây dựng core
- Kết nối peer  
- Gửi/nhận tin nhắn  

## Giai đoạn 3: Tính năng nâng cao
- Chat nhóm  
- Retry khi lỗi  
- Encryption  

## Giai đoạn 4: UI Web
- Giao diện chat đơn giản  
- Hiển thị danh sách peer  

## Giai đoạn 5: Testing & Evaluation
- Test nhiều peer  
- Mô phỏng peer join/leave  

---

# 10. Risk Analysis

| Rủi ro | Giải pháp |
|------|---------|
| Peer mất kết nối | Retry + timeout |
| Mất dữ liệu | ACK message |
| Xung đột kết nối | Quản lý session |
| Bảo mật chưa đủ | Áp dụng encryption |

---
